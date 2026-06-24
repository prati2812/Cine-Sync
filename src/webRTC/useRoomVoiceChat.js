import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import { auth, database } from '../config/firebase';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export function useRoomVoiceChat(roomId, participants = [], enabled = true) {
  const myUid = auth().currentUser?.uid;
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const candidateListenersRef = useRef({});

  const [isMuted, setIsMuted] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeSpeakerCount, setActiveSpeakerCount] = useState(0);
  const [error, setError] = useState(null);

  const remoteParticipantIds = participants
    .map(item => item.uid)
    .filter(uid => uid && uid !== myUid);

  const updateConnectionState = useCallback(() => {
    setActiveSpeakerCount(Object.keys(peersRef.current).length);
  }, []);

  const removeCandidateListener = useCallback((remoteUid) => {
    const entry = candidateListenersRef.current[remoteUid];
    if (entry) {
      entry.ref.off('child_added', entry.handler);
      delete candidateListenersRef.current[remoteUid];
    }
  }, []);

  const clearSignalingForMe = useCallback(async () => {
    if (!roomId || !myUid) return;
    await Promise.all([
      database().ref(`rooms/${roomId}/voice/offers/${myUid}`).remove(),
      database().ref(`rooms/${roomId}/voice/answers/${myUid}`).remove(),
      database().ref(`rooms/${roomId}/voice/candidates/${myUid}`).remove(),
    ]);
  }, [myUid, roomId]);

  const cleanupPeer = useCallback((remoteUid) => {
    removeCandidateListener(remoteUid);
    const peer = peersRef.current[remoteUid];
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.close();
      delete peersRef.current[remoteUid];
    }
    updateConnectionState();
  }, [removeCandidateListener, updateConnectionState]);

  const cleanupAllPeers = useCallback(() => {
    Object.keys(peersRef.current).forEach(cleanupPeer);
  }, [cleanupPeer]);

  const teardownVoiceSession = useCallback(async () => {
    cleanupAllPeers();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (roomId && myUid) {
      try {
        await Promise.all([
          database().ref(`rooms/${roomId}/voice/participants/${myUid}`).remove(),
          clearSignalingForMe(),
        ]);
      } catch (err) {
        console.warn('[RoomVoice] teardown failed:', err);
      }
    }

    setActiveSpeakerCount(0);
    setIsConnecting(false);
  }, [cleanupAllPeers, clearSignalingForMe, myUid, roomId]);

  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('Microphone permission denied');
      }
    }

    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    stream.getAudioTracks().forEach(track => {
      track.enabled = true;
    });

    localStreamRef.current = stream;
    return stream;
  }, []);

  const updateParticipantPresence = useCallback(async (mutedValue) => {
    if (!roomId || !myUid) return;
    const currentUser = auth().currentUser;
    const currentParticipant = participants.find(item => item.uid === myUid);

    await database().ref(`rooms/${roomId}/voice/participants/${myUid}`).set({
      uid: myUid,
      email: currentUser?.email || '',
      name: currentParticipant?.name || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User',
      muted: mutedValue,
      updatedAt: database.ServerValue.TIMESTAMP,
    });
  }, [myUid, participants, roomId]);

  const listenForCandidates = useCallback((remoteUid) => {
    if (!roomId || !myUid || candidateListenersRef.current[remoteUid]) return;

    const candidatesRef = database().ref(`rooms/${roomId}/voice/candidates/${myUid}/${remoteUid}`);
    const handler = snapshot => {
      const candidate = snapshot.val();
      if (!candidate || !peersRef.current[remoteUid]) return;
      peersRef.current[remoteUid]
        .addIceCandidate(new RTCIceCandidate(candidate))
        .catch(err => console.warn('[RoomVoice] addIceCandidate failed:', err));
    };

    candidatesRef.on('child_added', handler);
    candidateListenersRef.current[remoteUid] = { ref: candidatesRef, handler };
  }, [myUid, roomId]);

  const createPeer = useCallback(async (remoteUid) => {
    if (!roomId || !myUid || !localStreamRef.current || remoteUid === myUid) {
      return null;
    }
    if (peersRef.current[remoteUid]) {
      return peersRef.current[remoteUid];
    }

    const peer = new RTCPeerConnection(ICE_SERVERS);
    localStreamRef.current.getTracks().forEach(track => {
      peer.addTrack(track, localStreamRef.current);
    });

    peer.onicecandidate = event => {
      if (!event.candidate) return;
      database()
        .ref(`rooms/${roomId}/voice/candidates/${remoteUid}/${myUid}`)
        .push(event.candidate.toJSON());
    };

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === 'connected') {
        updateConnectionState();
      }
      if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        cleanupPeer(remoteUid);
      }
    };

    peersRef.current[remoteUid] = peer;
    listenForCandidates(remoteUid);
    updateConnectionState();
    return peer;
  }, [cleanupPeer, listenForCandidates, myUid, roomId, updateConnectionState]);

  const createOfferForPeer = useCallback(async (remoteUid) => {
    try {
      const peer = await createPeer(remoteUid);
      if (!peer) return;

      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await peer.setLocalDescription(offer);

      await database().ref(`rooms/${roomId}/voice/offers/${remoteUid}/${myUid}`).set({
        from: myUid,
        to: remoteUid,
        type: offer.type,
        sdp: offer.sdp,
        timestamp: database.ServerValue.TIMESTAMP,
      });
    } catch (err) {
      console.warn('[RoomVoice] createOffer failed:', err);
      setError(err.message || 'Failed to connect room voice');
    }
  }, [createPeer, myUid, roomId]);

  const handleOffer = useCallback(async (remoteUid, offerData) => {
    try {
      const peer = await createPeer(remoteUid);
      if (!peer || peer.currentRemoteDescription) return;

      await peer.setRemoteDescription(
        new RTCSessionDescription({
          type: offerData.type,
          sdp: offerData.sdp,
        })
      );

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      await database().ref(`rooms/${roomId}/voice/answers/${remoteUid}/${myUid}`).set({
        from: myUid,
        to: remoteUid,
        type: answer.type,
        sdp: answer.sdp,
        timestamp: database.ServerValue.TIMESTAMP,
      });

      await database().ref(`rooms/${roomId}/voice/offers/${myUid}/${remoteUid}`).remove();
    } catch (err) {
      console.warn('[RoomVoice] handleOffer failed:', err);
      cleanupPeer(remoteUid);
      setError(err.message || 'Failed to answer room voice');
    }
  }, [cleanupPeer, createPeer, myUid, roomId]);

  const handleAnswer = useCallback(async (remoteUid, answerData) => {
    const peer = peersRef.current[remoteUid];
    if (!peer || peer.currentRemoteDescription) return;

    try {
      await peer.setRemoteDescription(
        new RTCSessionDescription({
          type: answerData.type,
          sdp: answerData.sdp,
        })
      );
      await database().ref(`rooms/${roomId}/voice/answers/${myUid}/${remoteUid}`).remove();
    } catch (err) {
      console.warn('[RoomVoice] handleAnswer failed:', err);
      cleanupPeer(remoteUid);
      setError(err.message || 'Failed to finish room voice connection');
    }
  }, [cleanupPeer, myUid, roomId]);

  const joinVoiceSession = useCallback(async () => {
    if (!enabled || !roomId || !myUid || !isMuted) return;

    try {
      setError(null);
      setIsConnecting(true);
      await clearSignalingForMe();
      await getLocalStream();
      await updateParticipantPresence(false);
      database().ref(`rooms/${roomId}/voice/participants/${myUid}`).onDisconnect().remove();

      setIsMuted(false);

      await Promise.all(
        remoteParticipantIds
          .filter(uid => myUid.localeCompare(uid) < 0)
          .map(uid => createOfferForPeer(uid))
      );
    } catch (err) {
      console.warn('[RoomVoice] join failed:', err);
      await teardownVoiceSession();
      setIsMuted(true);
      setError(err.message || 'Unable to start room voice');
    } finally {
      setIsConnecting(false);
    }
  }, [
    clearSignalingForMe,
    createOfferForPeer,
    enabled,
    getLocalStream,
    isMuted,
    myUid,
    remoteParticipantIds,
    roomId,
    teardownVoiceSession,
    updateParticipantPresence,
  ]);

  const leaveVoiceSession = useCallback(async () => {
    await teardownVoiceSession();
    setIsMuted(true);
  }, [teardownVoiceSession]);

  const toggleMute = useCallback(async () => {
    if (!enabled) return;
    if (isMuted) {
      await joinVoiceSession();
      return;
    }
    await leaveVoiceSession();
  }, [enabled, isMuted, joinVoiceSession, leaveVoiceSession]);

  useEffect(() => {
    if (!roomId || !myUid || isMuted) return;

    const offersRef = database().ref(`rooms/${roomId}/voice/offers/${myUid}`);
    const answersRef = database().ref(`rooms/${roomId}/voice/answers/${myUid}`);

    const offerHandler = snapshot => {
      const remoteUid = snapshot.key;
      const offerData = snapshot.val();
      if (remoteUid && offerData?.sdp) {
        handleOffer(remoteUid, offerData);
      }
    };

    const answerHandler = snapshot => {
      const remoteUid = snapshot.key;
      const answerData = snapshot.val();
      if (remoteUid && answerData?.sdp) {
        handleAnswer(remoteUid, answerData);
      }
    };

    offersRef.on('child_added', offerHandler);
    offersRef.on('child_changed', offerHandler);
    answersRef.on('child_added', answerHandler);
    answersRef.on('child_changed', answerHandler);

    return () => {
      offersRef.off('child_added', offerHandler);
      offersRef.off('child_changed', offerHandler);
      answersRef.off('child_added', answerHandler);
      answersRef.off('child_changed', answerHandler);
    };
  }, [handleAnswer, handleOffer, isMuted, myUid, roomId]);

  useEffect(() => {
    if (!enabled || !roomId || !myUid || isMuted) return;

    remoteParticipantIds
      .filter(uid => myUid.localeCompare(uid) < 0)
      .forEach(uid => {
        if (!peersRef.current[uid]) {
          createOfferForPeer(uid);
        }
      });

    Object.keys(peersRef.current)
      .filter(uid => !remoteParticipantIds.includes(uid))
      .forEach(cleanupPeer);
  }, [cleanupPeer, createOfferForPeer, enabled, isMuted, myUid, remoteParticipantIds, roomId]);

  useEffect(() => {
    if (enabled) return;
    leaveVoiceSession();
  }, [enabled, leaveVoiceSession]);

  useEffect(() => {
    return () => {
      leaveVoiceSession();
    };
  }, [leaveVoiceSession]);

  return {
    isReady: enabled && !isConnecting,
    isMuted,
    isConnecting,
    activeSpeakerCount,
    error,
    toggleMute,
  };
}
