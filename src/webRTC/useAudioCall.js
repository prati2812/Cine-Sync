import { useRef, useState, useEffect, useCallback } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import {
  getDatabase,
  ref,
  set,
  push,
  get,
  onValue,
  onChildAdded,
  off,
  serverTimestamp,
  remove,
} from 'firebase/database';
import { auth } from '../config/firebase';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

const CALL_TIMEOUT_MS = 40000; // 40 seconds

/**
 * @param {string|null} chatId
 * Hook for audio AND video calls over WebRTC with Firebase signaling.
 */
export function useAudioCall(chatId) {
  const pc = useRef(null);
  const localStreamRef = useRef(null);
  const listenersRef = useRef([]);
  const callTimerRef = useRef(null);
  const durationTimerRef = useRef(null);
  const callStateRef = useRef('idle'); // mirrors callState for closures
  const answerProcessedRef = useRef(false); // prevents duplicate setRemoteDescription

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
    const fn = eventType === 'child_added' ? onChildAdded : onValue;
    fn(dbRef, callback);
    listenersRef.current.push({ ref: dbRef, eventType });
  }, []);

  const removeAllListeners = useCallback(() => {
    listenersRef.current.forEach(({ ref: r }) => {
      off(r);
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
        ? { facingMode: 'user', width: 640, height: 480, frameRate: 30 }
        : false,
    };
    const stream = await mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const createPeerConnection = useCallback(() => {
    const peer = new RTCPeerConnection(ICE_SERVERS);

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      console.log('[WebRTC] Connection state:', state);
      if (state === 'connected') {
        // Clear the timeout — we're connected
        if (callTimerRef.current) {
          clearTimeout(callTimerRef.current);
          callTimerRef.current = null;
        }
        setCallState('connected');
        durationTimerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
      }
      // Only cleanup on truly terminal states, NOT 'disconnected' (which can be transient)
      if (state === 'failed') {
        console.log('[WebRTC] Connection failed, cleaning up');
        setCallError('Connection failed');
        cleanupLocal();
      }
    };

    peer.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state:', peer.iceConnectionState);
    };

    // Handle remote stream (for both audio and video)
    peer.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track?.kind);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    pc.current = peer;
    return peer;
  }, []);

  // ─── ICE Candidate Exchange ───────────────────────────────

  const setupICECandidateSending = useCallback((peer) => {
    if (!chatId) return;
    const db = getDatabase();
    const myUid = auth.currentUser?.uid;

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] Sending ICE candidate');
        const candidateRef = push(
          ref(db, `calls/${chatId}/candidates/${myUid}`)
        );
        set(candidateRef, event.candidate.toJSON());
      }
    };
  }, [chatId]);

  const listenForRemoteCandidates = useCallback((remoteUid) => {
    if (!chatId) return;
    const db = getDatabase();
    const candidatesRef = ref(db, `calls/${chatId}/candidates/${remoteUid}`);

    addFirebaseListener(candidatesRef, 'child_added', (snapshot) => {
      const candidate = snapshot.val();
      if (candidate && pc.current) {
        console.log('[WebRTC] Adding remote ICE candidate');
        pc.current
          .addIceCandidate(new RTCIceCandidate(candidate))
          .catch(err => console.warn('[WebRTC] Failed to add ICE candidate:', err));
      }
    });
  }, [chatId, addFirebaseListener]);

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
      pc.current.onconnectionstatechange = null;
      pc.current.oniceconnectionstatechange = null;
      pc.current.close();
      pc.current = null;
    }

    removeAllListeners();

    answerProcessedRef.current = false;
    setCallState('idle');
    setCallDuration(0);
    setIsMuted(false);
    setIsSpeaker(false);
    setIsCameraOff(false);
    setCallError(null);
    setLocalStream(null);
    setRemoteStream(null);
  }, [removeAllListeners, setCallState]);

  // ─── End Call (public — signals Firebase, then cleans up locally) ─

  const endCall = useCallback(async (reason = 'ended') => {
    const db = getDatabase();
    const myUid = auth.currentUser?.uid;

    if (chatId && myUid) {
      try {
        // Write ended signal
        await set(ref(db, `calls/${chatId}/ended`), {
          by: myUid,
          reason,
          timestamp: serverTimestamp(),
        });
        // DO NOT remove the call node here — let the remote side see the 'ended'
        // signal first. Schedule cleanup of Firebase data after a delay.
        setTimeout(async () => {
          try {
            await remove(ref(db, `calls/${chatId}`));
          } catch (_) {}
        }, 3000);
      } catch (e) {
        console.warn('[WebRTC] Error writing call-ended signal:', e);
      }
    }

    cleanupLocal();
  }, [chatId, cleanupLocal]);

  // ─── Start Call (Caller) ──────────────────────────────────

  const startCall = useCallback(async (type = 'audio') => {
    if (!chatId || !auth.currentUser) {
      setCallError('Chat not initialized');
      return;
    }

    try {
      setCallError(null);
      setCallType(type);
      setCallState('calling');

      const db = getDatabase();
      await remove(ref(db, `calls/${chatId}`));

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

      // Write offer to Firebase (include callType so callee knows)
      console.log('[WebRTC] Saving offer to Firebase...');
      await set(ref(db, `calls/${chatId}/offer`), {
        type: offer.type,
        sdp: offer.sdp,
        from: auth.currentUser.uid,
        callType: type,
        timestamp: serverTimestamp(),
      });

      // Listen for answer
      answerProcessedRef.current = false;
      const answerRef = ref(db, `calls/${chatId}/answer`);
      addFirebaseListener(answerRef, 'value', async (snapshot) => {
        const answerData = snapshot.val();
        if (!answerData || !answerData.sdp) return;
        // Synchronous guard — prevents the race condition where
        // onValue fires twice before the first await completes
        if (answerProcessedRef.current) return;
        answerProcessedRef.current = true;

        console.log('[WebRTC] Received answer, setting remote description...');
        try {
          await pc.current.setRemoteDescription(
            new RTCSessionDescription({
              type: answerData.type,
              sdp: answerData.sdp,
            })
          );
          listenForRemoteCandidates(answerData.from);
        } catch (err) {
          console.error('[WebRTC] Error setting remote description:', err);
          answerProcessedRef.current = false; // allow retry
          setCallError('Failed to connect call');
          endCall('error');
        }
      });

      // Listen for call-ended / declined signal from remote
      const endedRef = ref(db, `calls/${chatId}/ended`);
      addFirebaseListener(endedRef, 'value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.by !== auth.currentUser?.uid) {
          console.log('[WebRTC] Remote ended/declined the call. Reason:', data.reason);
          if (data.reason === 'declined') {
            setCallError('Call declined');
          }
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
  }, [chatId, getLocalMediaStream, createPeerConnection, setupICECandidateSending, addFirebaseListener, listenForRemoteCandidates, endCall, cleanupLocal, setCallState]);

  // ─── Listen for Incoming Calls (Callee) ───────────────────

  const listenIncoming = useCallback(() => {
    if (!chatId || !auth.currentUser) {
      console.log('[WebRTC] Cannot listen: no chatId or no user');
      return () => {};
    }

    const db = getDatabase();
    const offerRef = ref(db, `calls/${chatId}/offer`);

    console.log('[WebRTC] Listening for incoming calls on', `calls/${chatId}/offer`);

    const unsubscribe = onValue(offerRef, (snapshot) => {
      const offerData = snapshot.val();
      if (
        offerData &&
        offerData.from &&
        offerData.from !== auth.currentUser?.uid &&
        offerData.sdp
      ) {
        // Only show incoming if we're not already in a call
        if (callStateRef.current === 'idle') {
          console.log('[WebRTC] Incoming call detected from:', offerData.from);
          setCallType(offerData.callType || 'audio');
          setCallState('incoming');
          setCallerName(offerData.from);
          setCallError(null);
        }
      }
    });

    return () => {
      off(offerRef);
    };
  }, [chatId, setCallState]);

  // ─── Answer Call (Callee) ─────────────────────────────────

  const answerCall = useCallback(async () => {
    if (!chatId || !auth.currentUser) return;

    try {
      setCallError(null);
      const db = getDatabase();

      const offerSnapshot = await get(ref(db, `calls/${chatId}/offer`));
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

      // Create and set local description (answer)
      console.log('[WebRTC] Creating answer...');
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      // Write answer to Firebase
      console.log('[WebRTC] Saving answer to Firebase...');
      await set(ref(db, `calls/${chatId}/answer`), {
        type: answer.type,
        sdp: answer.sdp,
        from: auth.currentUser.uid,
        timestamp: serverTimestamp(),
      });

      // Listen for ICE candidates from caller
      listenForRemoteCandidates(offerData.from);

      // Listen for call-ended signal from remote
      const endedRef = ref(db, `calls/${chatId}/ended`);
      addFirebaseListener(endedRef, 'value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.by !== auth.currentUser?.uid) {
          console.log('[WebRTC] Remote ended the call');
          cleanupLocal();
        }
      });

      setCallState('connected');

    } catch (error) {
      console.error('[WebRTC] answerCall error:', error);
      setCallError(error.message || 'Failed to answer call');
      cleanupLocal();
    }
  }, [chatId, getLocalMediaStream, createPeerConnection, setupICECandidateSending, listenForRemoteCandidates, addFirebaseListener, cleanupLocal, setCallState]);

  // ─── Decline Call (Callee) ────────────────────────────────

  const declineCall = useCallback(async () => {
    const db = getDatabase();
    if (chatId && auth.currentUser) {
      // Write ended signal with reason — do NOT remove the node immediately
      await set(ref(db, `calls/${chatId}/ended`), {
        by: auth.currentUser.uid,
        reason: 'declined',
        timestamp: serverTimestamp(),
      });
      // Let the caller see the signal; they'll clean up Firebase after a delay
    }
    cleanupLocal();
  }, [chatId, cleanupLocal]);

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
  }, []);

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
