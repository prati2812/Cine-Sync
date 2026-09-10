import { useRef, useState, useEffect, useCallback } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import { auth, database } from '../config/firebase';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

const CALL_TIMEOUT_MS = 40000; // 40 seconds

/**
 * @param {string|null} chatId
 * Hook for audio AND video calls over WebRTC with Firebase signaling.
 */
export function useAudioCall(chatId, otherUserId = null) {
  const pc = useRef(null);
  const localStreamRef = useRef(null);
  const listenersRef = useRef([]);
  const callTimerRef = useRef(null);
  const durationTimerRef = useRef(null);
  const callStateRef = useRef('idle'); // mirrors callState for closures
  const answerProcessedRef = useRef(false); // prevents duplicate setRemoteDescription
  const candidateQueueRef = useRef([]); // holds ICE candidates received before remoteDescription is ready

  const callSessionIdRef = useRef(null);
  const callerIdRef = useRef(null);
  const callTypeRef = useRef('audio');
  const wasConnectedRef = useRef(false);
  const callDurationRef = useRef(0);
  const loggedSessionRef = useRef(null);
  const cleanupLocalRef = useRef(null);

  const [callState, setCallStateRaw] = useState('idle'); // idle | calling | incoming | connected
  const [callType, setCallType] = useState('audio'); // 'audio' | 'video'
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callerName, setCallerName] = useState('');
  const [callError, setCallError] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Wrapper that keeps the ref in sync with state
  const setCallState = useCallback((v) => {
    callStateRef.current = v;
    setCallStateRaw(v);
  }, []);

  // ─── Helpers ──────────────────────────────────────────────

  const addFirebaseListener = useCallback((dbRef, eventType, callback) => {
    dbRef.on(eventType, callback);
    listenersRef.current.push({ ref: dbRef, eventType });
  }, []);

  const removeAllListeners = useCallback(() => {
    listenersRef.current.forEach(({ ref: r }) => {
      r.off();
    });
    listenersRef.current = [];
  }, []);

  const getLocalMediaStream = useCallback(async (type = 'audio') => {
    // Android requires runtime permission requests
    if (Platform.OS === 'android') {
      const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
      if (type === 'video') {
        permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      }
      const granted = await PermissionsAndroid.requestMultiple(permissions);
      const audioGranted = granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
      const cameraGranted = type !== 'video' || granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
      if (!audioGranted || !cameraGranted) {
        throw new Error('Microphone or camera permission denied');
      }
    }

    const constraints = {
      audio: true,
      video: type === 'video'
        ? { facingMode: 'user', frameRate: 30 }
        : false,
    };
    const stream = await mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const processCandidateQueue = useCallback(() => {
    if (pc.current && pc.current.remoteDescription && candidateQueueRef.current.length > 0) {
      console.log('[WebRTC] Flushing queued ICE candidates:', candidateQueueRef.current.length);
      candidateQueueRef.current.forEach((candidate) => {
        pc.current
          .addIceCandidate(new RTCIceCandidate(candidate))
          .catch(err => console.warn('[WebRTC] Failed to add queued ICE candidate:', err));
      });
      candidateQueueRef.current = [];
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    const peer = new RTCPeerConnection(ICE_SERVERS);

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      console.log('[WebRTC] Connection state:', state);
      if (state === 'connected') {
        if (callTimerRef.current) {
          clearTimeout(callTimerRef.current);
          callTimerRef.current = null;
        }
        setCallState('connected');
        if (!durationTimerRef.current) {
          durationTimerRef.current = setInterval(() => {
            setCallDuration(prev => prev + 1);
          }, 1000);
        }
      }
      if (state === 'failed') {
        console.log('[WebRTC] Connection failed, cleaning up');
        setCallError('Connection failed');
        if (cleanupLocalRef.current) cleanupLocalRef.current();
      }
    };

    peer.oniceconnectionstatechange = () => {
      const iceState = peer.iceConnectionState;
      console.log('[WebRTC] ICE state:', iceState);
      if (iceState === 'connected' || iceState === 'completed') {
        if (callTimerRef.current) {
          clearTimeout(callTimerRef.current);
          callTimerRef.current = null;
        }
        setCallState('connected');
        if (!durationTimerRef.current) {
          durationTimerRef.current = setInterval(() => {
            setCallDuration(prev => prev + 1);
          }, 1000);
        }
      }
    };

    // Both onaddstream and ontrack for maximum cross-platform compatibility
    peer.onaddstream = (event) => {
      console.log('[WebRTC] Received remote stream via onaddstream:', event.stream?.id);
      if (event.stream) {
        setRemoteStream(event.stream);
      }
    };

    peer.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track?.kind, 'streams:', event.streams?.length);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      } else if (event.track) {
        setRemoteStream(prev => {
          let stream = prev;
          if (!stream) {
            stream = new MediaStream();
          }
          stream.addTrack(event.track);
          return stream;
        });
      }
    };

    pc.current = peer;
    return peer;
  }, [setCallState]);

  // ─── ICE Candidate Exchange ───────────────────────────────

  const setupICECandidateSending = useCallback((peer) => {
    if (!chatId) return;
    const db = database();
    const myUid = auth().currentUser?.uid;
    if (!myUid) {
      console.warn('[WebRTC] Cannot setup ICE candidate sending: no auth().currentUser');
      return;
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] Sending ICE candidate to Firebase');
        const candidateRef = db.ref(`chats/${chatId}/call/candidates/${myUid}`).push();
        candidateRef.set(event.candidate.toJSON());
      }
    };
  }, [chatId]);

  const listenForRemoteCandidates = useCallback((remoteUid) => {
    if (!chatId) return;
    const db = database();
    const candidatesRef = db.ref(`chats/${chatId}/call/candidates/${remoteUid}`);

    addFirebaseListener(candidatesRef, 'child_added', (snapshot) => {
      const candidate = snapshot.val();
      if (!candidate) return;

      if (pc.current && pc.current.remoteDescription) {
        console.log('[WebRTC] Adding remote ICE candidate');
        pc.current
          .addIceCandidate(new RTCIceCandidate(candidate))
          .catch(err => console.warn('[WebRTC] Failed to add ICE candidate:', err));
      } else {
        console.log('[WebRTC] Queuing ICE candidate (remoteDescription pending)');
        candidateQueueRef.current.push(candidate);
      }
    });
  }, [chatId, addFirebaseListener]);

  // ─── Record Call Log into chats/${chatId}/messages ───────
  const recordCallLog = useCallback(async (explicitReason = null) => {
    const sessionId = callSessionIdRef.current;
    const callerId = callerIdRef.current;
    const type = callTypeRef.current || 'audio';
    const duration = callDurationRef.current || 0;
    const wasConnected = wasConnectedRef.current;

    if (!chatId || !sessionId || !callerId) return;
    if (loggedSessionRef.current === sessionId) return;
    loggedSessionRef.current = sessionId;

    let status = 'completed';
    if (!wasConnected) {
      if (explicitReason === 'declined') {
        status = 'declined';
      } else if (explicitReason === 'timeout') {
        status = 'missed';
      } else {
        status = 'cancelled';
      }
    }

    try {
      const db = database();
      const logRef = db.ref(`chats/${chatId}/call_logs/${sessionId}`);

      // Atomic transaction: ensures only the first client logs the call to prevent duplicates
      const txResult = await logRef.transaction((current) => {
        if (current === null) {
          return { logged: true, timestamp: database.ServerValue.TIMESTAMP };
        }
        return undefined; // Abort if already logged
      });

      if (!txResult.committed) return;

      const messagesRef = db.ref(`chats/${chatId}/messages`);
      const newMsgRef = messagesRef.push();

      const callPayload = {
        id: newMsgRef.key,
        type: 'call',
        callType: type, // 'audio' | 'video'
        callStatus: status, // 'completed' | 'missed' | 'declined' | 'cancelled'
        duration: duration,
        callerId: callerId,
        senderId: callerId,
        timestamp: database.ServerValue.TIMESTAMP,
        seen: false,
        status: 'sent',
      };

      await newMsgRef.set(callPayload);

      // Duration formatting for lastMessage
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

      const isMissed = status !== 'completed';
      const icon = type === 'video' ? '📹' : '📞';
      const label = type === 'video' ? 'Video call' : 'Voice call';

      const updates = {};
      // Caller's lastMessage
      updates[`user_chats/${callerId}/${chatId}/lastMessage`] = isMissed
        ? `${icon} ${label} (No answer)`
        : `${icon} ${label} (${durationStr})`;
      updates[`user_chats/${callerId}/${chatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;

      // Callee's lastMessage
      if (otherUserId) {
        updates[`user_chats/${otherUserId}/${chatId}/lastMessage`] = isMissed
          ? `${icon} Missed ${label.toLowerCase()}`
          : `${icon} ${label} (${durationStr})`;
        updates[`user_chats/${otherUserId}/${chatId}/lastMessageTimestamp`] = database.ServerValue.TIMESTAMP;
      }

      await db.ref().update(updates);
    } catch (err) {
      console.warn('[WebRTC] Error logging call message:', err);
    }
  }, [chatId, otherUserId]);

  // ─── Cleanup (local only — no Firebase write) ────────────

  const cleanupLocal = useCallback(() => {
    console.log('[WebRTC] Cleaning up locally...');

    if (callTimerRef.current) {
      clearTimeout(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (pc.current) {
      pc.current.onicecandidate = null;
      pc.current.ontrack = null;
      pc.current.onaddstream = null;
      pc.current.onconnectionstatechange = null;
      pc.current.oniceconnectionstatechange = null;
      pc.current.close();
      pc.current = null;
    }

    removeAllListeners();

    candidateQueueRef.current = [];
    answerProcessedRef.current = false;
    callDurationRef.current = 0;

    if (auth().currentUser?.uid) {
      database().ref(`user_calls/${auth().currentUser.uid}/incoming`).remove().catch(() => {});
    }

    setCallState('idle');
    setCallDuration(0);
    setIsMuted(false);
    setIsSpeaker(false);
    setIsCameraOff(false);
    setCallError(null);
    setLocalStream(null);
    setRemoteStream(null);
  }, [removeAllListeners, setCallState]);

  cleanupLocalRef.current = cleanupLocal;

  // ─── End Call (public — signals Firebase, then cleans up locally) ─

  const endCall = useCallback(async (reason = 'ended') => {
    const db = database();
    const myUid = auth().currentUser?.uid;

    await recordCallLog(reason);

    if (otherUserId) {
      db.ref(`user_calls/${otherUserId}/incoming`).remove().catch(() => {});
    }
    if (myUid) {
      db.ref(`user_calls/${myUid}/incoming`).remove().catch(() => {});
    }

    if (chatId && myUid) {
      try {
        // Write ended signal
        await db.ref(`chats/${chatId}/call/ended`).set({
          by: myUid,
          reason,
          timestamp: database.ServerValue.TIMESTAMP,
        });
        // Schedule cleanup of Firebase call data after a delay
        setTimeout(async () => {
          try {
            await db.ref(`chats/${chatId}/call`).remove();
          } catch (_) {}
        }, 3000);
      } catch (e) {
        console.warn('[WebRTC] Error writing call-ended signal:', e);
      }
    }

    cleanupLocal();
  }, [chatId, otherUserId, cleanupLocal, recordCallLog]);

  // ─── Start Call (Caller) ──────────────────────────────────

  const startCall = useCallback(async (type = 'audio') => {
    if (!chatId || !auth().currentUser) {
      setCallError('Chat not initialized');
      return;
    }

    try {
      setCallError(null);
      setCallType(type);
      setCallState('calling');

      const sessionId = 'call_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      callSessionIdRef.current = sessionId;
      callerIdRef.current = auth().currentUser.uid;
      callTypeRef.current = type;
      wasConnectedRef.current = false;
      callDurationRef.current = 0;

      const db = database();
      await db.ref(`chats/${chatId}/call`).remove();

      // Get microphone (+ camera for video)
      const stream = await getLocalMediaStream(type);

      const peer = createPeerConnection();

      stream.getTracks().forEach(track => {
        peer.addTrack(track, stream);
      });

      setupICECandidateSending(peer);

      // Create offer
      console.log('[WebRTC] Creating offer...');
      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video',
      });
      await peer.setLocalDescription(offer);

      // Write offer to Firebase (include callType and sessionId so callee knows)
      console.log('[WebRTC] Saving offer to Firebase...');
      await db.ref(`chats/${chatId}/call/offer`).set({
        type: offer.type,
        sdp: offer.sdp,
        from: auth().currentUser.uid,
        callType: type,
        sessionId: sessionId,
        timestamp: database.ServerValue.TIMESTAMP,
      });

      // Write incoming notification to callee's user_calls node for app-wide foreground heads-up banner
      let targetUserId = otherUserId;
      if (!targetUserId && chatId) {
        try {
          const partSnap = await db.ref(`chats/${chatId}/participants`).once('value');
          const participants = partSnap.val() || {};
          targetUserId = Object.keys(participants).find(uid => uid !== auth().currentUser?.uid);
          console.log('[WebRTC] Resolved targetUserId from participants:', targetUserId);
        } catch (partErr) {
          console.warn('[WebRTC] Could not resolve participants for incoming call signal:', partErr);
        }
      }

      if (targetUserId) {
        try {
          let resolvedCallerName = 'Friend';
          let resolvedCallerAvatar = null;
          const callerSnap = await db.ref(`users/${auth().currentUser.uid}`).once('value');
          if (callerSnap.exists()) {
            const val = callerSnap.val();
            resolvedCallerName = val.username || val.displayName || 'Friend';
            resolvedCallerAvatar = val.avatar || val.photoURL || null;
          }

          console.log('[WebRTC] Writing incoming call signal to user_calls/' + targetUserId + '/incoming');
          const incomingRef = db.ref(`user_calls/${targetUserId}/incoming`);
          await incomingRef.set({
            chatId: chatId,
            callerId: auth().currentUser.uid,
            callerName: resolvedCallerName,
            callerAvatar: resolvedCallerAvatar,
            callType: type,
            sessionId: sessionId,
            status: 'ringing',
            timestamp: database.ServerValue.TIMESTAMP,
          });
          incomingRef.onDisconnect().remove();
          console.log('[WebRTC] Successfully written incoming call notification to Firebase for:', targetUserId);
        } catch (incomingErr) {
          console.warn('[WebRTC] Failed to write user_calls incoming signal:', incomingErr);
        }
      } else {
        console.warn('[WebRTC] Warning: targetUserId is missing. Incoming call notification could not be routed.');
      }

      // Listen for answer
      answerProcessedRef.current = false;
      const answerRef = db.ref(`chats/${chatId}/call/answer`);
      addFirebaseListener(answerRef, 'value', async (snapshot) => {
        const answerData = snapshot.val();
        if (!answerData || !answerData.sdp) return;
        // Synchronous guard — prevents the race condition where
        // onValue fires twice before the first await completes
        if (answerProcessedRef.current) return;
        answerProcessedRef.current = true;

        console.log('[WebRTC] Received answer, setting remote description & connecting...');
        try {
          if (callTimerRef.current) {
            clearTimeout(callTimerRef.current);
            callTimerRef.current = null;
          }
          setCallState('connected');
          wasConnectedRef.current = true;
          if (!durationTimerRef.current) {
            durationTimerRef.current = setInterval(() => {
              setCallDuration(prev => {
                const next = prev + 1;
                callDurationRef.current = next;
                return next;
              });
            }, 1000);
          }

          await pc.current.setRemoteDescription(
            new RTCSessionDescription({
              type: answerData.type,
              sdp: answerData.sdp,
            })
          );
          processCandidateQueue();
          listenForRemoteCandidates(answerData.from);
        } catch (err) {
          console.error('[WebRTC] Error setting remote description:', err);
          answerProcessedRef.current = false; // allow retry
          setCallError('Failed to connect call');
          endCall('error');
        }
      });

      // Listen for call-ended / declined signal from remote
      const endedRef = db.ref(`chats/${chatId}/call/ended`);
      addFirebaseListener(endedRef, 'value', async (snapshot) => {
        const data = snapshot.val();
        if (data && data.by !== auth().currentUser?.uid) {
          console.log('[WebRTC] Remote ended/declined the call. Reason:', data.reason);
          if (data.reason === 'declined') {
            setCallError('Call declined');
          }
          await recordCallLog(data.reason || 'ended');
          cleanupLocal();
        }
      });

      // Timeout — uses ref so the closure sees the latest state
      callTimerRef.current = setTimeout(() => {
        if (callStateRef.current === 'calling') {
          console.log('[WebRTC] Call timeout — no answer');
          setCallError('No answer');
          endCall('timeout');
        }
      }, CALL_TIMEOUT_MS);

    } catch (error) {
      console.error('[WebRTC] startCall error:', error);
      setCallError(error.message || 'Failed to start call');
      cleanupLocal();
    }
  }, [chatId, otherUserId, getLocalMediaStream, createPeerConnection, setupICECandidateSending, addFirebaseListener, processCandidateQueue, listenForRemoteCandidates, endCall, cleanupLocal, setCallState, recordCallLog]);

  // ─── Listen for Incoming Calls (Callee) ───────────────────

  const listenIncoming = useCallback(() => {
    if (!chatId || !auth().currentUser) {
      console.log('[WebRTC] Cannot listen: no chatId or no user');
      return () => {};
    }

    const db = database();
    const offerRef = db.ref(`chats/${chatId}/call/offer`);
    const endedRef = db.ref(`chats/${chatId}/call/ended`);

    console.log('[WebRTC] Listening for incoming calls on', `chats/${chatId}/call/offer`);

    offerRef.on('value', (snapshot) => {
      const offerData = snapshot.val();
      if (!offerData || !offerData.sdp) {
        if (callStateRef.current === 'incoming') {
          console.log('[WebRTC] Offer removed while incoming');
          if (auth().currentUser?.uid) {
            database().ref(`user_calls/${auth().currentUser.uid}/incoming`).remove().catch(() => {});
          }
          recordCallLog('cancelled');
          cleanupLocal();
        }
        return;
      }

      if (
        offerData.from &&
        offerData.from !== auth().currentUser?.uid
      ) {
        // Ignore stale offers older than 60 seconds
        if (offerData.timestamp && Date.now() - offerData.timestamp > 60000) {
          console.log('[WebRTC] Ignoring stale offer:', offerData.timestamp);
          return;
        }

        // Only show incoming if we're not already in a call
        if (callStateRef.current === 'idle') {
          console.log('[WebRTC] Incoming call detected from:', offerData.from, 'type:', offerData.callType);
          callSessionIdRef.current = offerData.sessionId || ('call_' + offerData.timestamp);
          callerIdRef.current = offerData.from;
          callTypeRef.current = offerData.callType || 'audio';
          wasConnectedRef.current = false;
          callDurationRef.current = 0;
          setCallType(offerData.callType || 'audio');
          setCallState('incoming');
          setCallerName(offerData.from);
          setCallError(null);
        }
      }
    });

    endedRef.on('value', async (snapshot) => {
      const data = snapshot.val();
      if (data && callStateRef.current === 'incoming') {
        console.log('[WebRTC] Caller cancelled while incoming');
        if (auth().currentUser?.uid) {
          database().ref(`user_calls/${auth().currentUser.uid}/incoming`).remove().catch(() => {});
        }
        await recordCallLog(data.reason || 'cancelled');
        cleanupLocal();
      }
    });

    return () => {
      offerRef.off('value');
      endedRef.off('value');
    };
  }, [chatId, setCallState, recordCallLog, cleanupLocal]);

  // ─── Answer Call (Callee) ─────────────────────────────────

  const answerCall = useCallback(async () => {
    if (!chatId || !auth().currentUser) return;

    try {
      setCallError(null);
      const db = database();

      const offerSnapshot = await db.ref(`chats/${chatId}/call/offer`).once('value');
      const offerData = offerSnapshot.val();

      if (!offerData || !offerData.sdp) {
        setCallError('Call no longer available');
        setCallState('idle');
        return;
      }

      const type = offerData.callType || 'audio';
      setCallType(type);

      // Get media
      const stream = await getLocalMediaStream(type);

      const peer = createPeerConnection();

      stream.getTracks().forEach(track => {
        peer.addTrack(track, stream);
      });

      setupICECandidateSending(peer);

      // Set remote description (the offer)
      console.log('[WebRTC] Setting remote description (offer)...');
      await peer.setRemoteDescription(
        new RTCSessionDescription({
          type: offerData.type,
          sdp: offerData.sdp,
        })
      );
      processCandidateQueue();

      // Create and set local description (answer)
      console.log('[WebRTC] Creating answer...');
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      // Write answer to Firebase
      console.log('[WebRTC] Saving answer to Firebase...');
      await db.ref(`chats/${chatId}/call/answer`).set({
        type: answer.type,
        sdp: answer.sdp,
        from: auth().currentUser.uid,
        timestamp: database.ServerValue.TIMESTAMP,
      });

      // Clear incoming notification once answered
      if (auth().currentUser?.uid) {
        db.ref(`user_calls/${auth().currentUser.uid}/incoming`).remove().catch(() => {});
      }

      // Listen for ICE candidates from caller
      listenForRemoteCandidates(offerData.from);

      // Listen for call-ended signal from remote
      const endedRef = db.ref(`chats/${chatId}/call/ended`);
      addFirebaseListener(endedRef, 'value', async (snapshot) => {
        const data = snapshot.val();
        if (data && data.by !== auth().currentUser?.uid) {
          console.log('[WebRTC] Remote ended the call');
          await recordCallLog(data.reason || 'ended');
          cleanupLocal();
        }
      });

      if (callTimerRef.current) {
        clearTimeout(callTimerRef.current);
        callTimerRef.current = null;
      }
      setCallState('connected');
      wasConnectedRef.current = true;
      if (!durationTimerRef.current) {
        durationTimerRef.current = setInterval(() => {
          setCallDuration(prev => {
            const next = prev + 1;
            callDurationRef.current = next;
            return next;
          });
        }, 1000);
      }

    } catch (error) {
      console.error('[WebRTC] answerCall error:', error);
      setCallError(error.message || 'Failed to answer call');
      cleanupLocal();
    }
  }, [chatId, getLocalMediaStream, createPeerConnection, setupICECandidateSending, processCandidateQueue, listenForRemoteCandidates, addFirebaseListener, cleanupLocal, setCallState, recordCallLog]);

  // ─── Decline Call (Callee) ────────────────────────────────

  const declineCall = useCallback(async () => {
    const db = database();
    const myUid = auth().currentUser?.uid;
    await recordCallLog('declined');

    if (myUid) {
      db.ref(`user_calls/${myUid}/incoming`).remove().catch(() => {});
    }

    if (chatId && myUid) {
      // Write ended signal with reason — do NOT remove the node immediately
      await db.ref(`chats/${chatId}/call/ended`).set({
        by: myUid,
        reason: 'declined',
        timestamp: database.ServerValue.TIMESTAMP,
      });
      // Let the caller see the signal; they'll clean up Firebase after a delay
    }
    cleanupLocal();
  }, [chatId, cleanupLocal, recordCallLog]);

  // ─── Controls ─────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(prev => !prev);
    }
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeaker(prev => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsCameraOff(prev => !prev);
    }
  }, []);

  const switchCamera = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        if (typeof track._switchCamera === 'function') {
          track._switchCamera();
        }
      });
    }
  }, []);

  // ─── Format duration ─────────────────────────────────────

  const formatDuration = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // ─── Cleanup on unmount ───────────────────────────────────

  useEffect(() => {
    return () => {
      cleanupLocal();
    };
  }, [cleanupLocal]);

  return {
    // State
    callState,
    callType,
    callDuration,
    isMuted,
    isSpeaker,
    isCameraOff,
    callerName,
    callError,
    localStream,
    remoteStream,
    // Actions
    startCall,
    answerCall,
    declineCall,
    endCall,
    listenIncoming,
    toggleMute,
    toggleSpeaker,
    toggleCamera,
    switchCamera,
    formatDuration,
  };
}
