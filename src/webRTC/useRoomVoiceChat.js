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
  const mountedRef = useRef(true);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const remoteStreamsRef = useRef({});
  const candidateListenersRef = useRef({});
  const participantNamesRef = useRef({});
  const remoteParticipantIdsRef = useRef([]);

  const [isReady, setIsReady] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [activeSpeakerCount, setActiveSpeakerCount] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [error, setError] = useState(null);

  const updateRemoteStreamsState = useCallback(() => {
    setRemoteStreams(Object.values(remoteStreamsRef.current));
    setActiveSpeakerCount(Object.keys(peersRef.current).length);
  }, []);

  const removeCandidateListener = useCallback((remoteUid) => {
    const entry = candidateListenersRef.current[remoteUid];
    if (entry) {
      entry.ref.off('child_added', entry.handler);
      delete candidateListenersRef.current[remoteUid];
    }
  }, []);

  const updateParticipantPresence = useCallback(async (mutedValue) => {
    if (!roomId || !myUid) return;
    const currentUser = auth().currentUser;
    const currentParticipant = participants.find(item => item.uid === myUid);

    await database().ref(`rooms/${roomId}/voice/participants/${myUid}`).update({
      uid: myUid,
      email: currentUser?.email || '',
      name: currentParticipant?.name || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User',
      muted: mutedValue,
      updatedAt: database.ServerValue.TIMESTAMP,
    });
  }, [myUid, participants, roomId]);

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
      track.enabled = false;
    });

    localStreamRef.current = stream;
    return stream;
  }, []);

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
    delete remoteStreamsRef.current[remoteUid];
    updateRemoteStreamsState();
  }, [removeCandidateListener, updateRemoteStreamsState]);

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
    if (!roomId || !myUid || remoteUid === myUid) return null;
    if (peersRef.current[remoteUid]) return peersRef.current[remoteUid];

    const localStream = await getLocalStream();
    const peer = new RTCPeerConnection(ICE_SERVERS);

    localStream.getTracks().forEach(track => {
      peer.addTrack(track, localStream);
    });

    peer.onicecandidate = event => {
      if (!event.candidate) return;
      database()
        .ref(`rooms/${roomId}/voice/candidates/${remoteUid}/${myUid}`)
        .push(event.candidate.toJSON());
    };

    peer.ontrack = event => {
      if (event.streams?.[0]) {
        remoteStreamsRef.current[remoteUid] = {
          id: remoteUid,
          stream: event.streams[0],
          name: participantNamesRef.current[remoteUid] || 'Participant',
        };
        updateRemoteStreamsState();
      }
    };

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        cleanupPeer(remoteUid);
      }
    };

    peersRef.current[remoteUid] = peer;
    listenForCandidates(remoteUid);
    updateRemoteStreamsState();
    return peer;
  }, [cleanupPeer, getLocalStream, listenForCandidates, myUid, roomId, updateRemoteStreamsState]);

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
      if (!peer) return;

      if (peer.currentRemoteDescription?.type === 'offer') {
        return;
      }

      if (peer.signalingState !== 'stable') {
        cleanupPeer(remoteUid);
      }

      const freshPeer = peersRef.current[remoteUid] || await createPeer(remoteUid);
      if (!freshPeer) return;

      await freshPeer.setRemoteDescription(
        new RTCSessionDescription({
          type: offerData.type,
          sdp: offerData.sdp,
        })
      );

      const answer = await freshPeer.createAnswer();
      await freshPeer.setLocalDescription(answer);

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
    if (!peer) return;
    if (peer.currentRemoteDescription) return;

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!roomId || !myUid || !enabled) return;
    let cancelled = false;

    const initialize = async () => {
      try {
        setError(null);
        await Promise.all([
          database().ref(`rooms/${roomId}/voice/offers/${myUid}`).remove(),
          database().ref(`rooms/${roomId}/voice/answers/${myUid}`).remove(),
          database().ref(`rooms/${roomId}/voice/candidates/${myUid}`).remove(),
        ]);
        await getLocalStream();
        if (cancelled || !mountedRef.current) return;
        await updateParticipantPresence(true);
        setIsReady(true);
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        setError(err.message || 'Unable to access microphone');
        setIsReady(false);
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, [enabled, getLocalStream, myUid, roomId, updateParticipantPresence]);

  useEffect(() => {
    if (!roomId || !myUid || !isReady) return;

    const presenceRef = database().ref(`rooms/${roomId}/voice/participants/${myUid}`);
    presenceRef.onDisconnect().remove();

    return () => {
      presenceRef.onDisconnect().cancel();
    };
  }, [isReady, myUid, roomId]);

  useEffect(() => {
    const names = {};
    participants.forEach(item => {
      if (item?.uid) {
        names[item.uid] = item.name;
      }
    });
    participantNamesRef.current = names;
  }, [participants]);

  useEffect(() => {
    if (!roomId || !myUid || !isReady) return;

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
  }, [handleAnswer, handleOffer, isReady, myUid, roomId]);

  useEffect(() => {
    if (!roomId || !myUid || !isReady) return;

    const remoteIds = participants
      .map(item => item.uid)
      .filter(uid => uid && uid !== myUid);

    remoteParticipantIdsRef.current
      .filter(uid => !remoteIds.includes(uid))
      .forEach(uid => cleanupPeer(uid));

    remoteParticipantIdsRef.current = remoteIds;

    remoteIds.forEach(uid => {
      if (myUid.localeCompare(uid) < 0 && !peersRef.current[uid]) {
        createOfferForPeer(uid);
      }
    });
  }, [cleanupPeer, createOfferForPeer, isReady, myUid, participants, roomId]);

  const toggleMute = useCallback(async () => {
    if (!localStreamRef.current) return;
    const nextMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
    try {
      await updateParticipantPresence(nextMuted);
    } catch (err) {
      console.warn('[RoomVoice] toggleMute presence update failed:', err);
    }
  }, [isMuted, updateParticipantPresence]);

  const disconnect = useCallback(async () => {
    if (roomId && myUid) {
      try {
        await Promise.all([
          database().ref(`rooms/${roomId}/voice/participants/${myUid}`).remove(),
          database().ref(`rooms/${roomId}/voice/offers/${myUid}`).remove(),
          database().ref(`rooms/${roomId}/voice/answers/${myUid}`).remove(),
          database().ref(`rooms/${roomId}/voice/candidates/${myUid}`).remove(),
        ]);
      } catch (err) {
        console.warn('[RoomVoice] remove presence failed:', err);
      }
    }

    Object.keys(candidateListenersRef.current).forEach(removeCandidateListener);
    Object.keys(peersRef.current).forEach(cleanupPeer);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    remoteStreamsRef.current = {};
    setRemoteStreams([]);
    setActiveSpeakerCount(0);
    setIsReady(false);
  }, [cleanupPeer, myUid, removeCandidateListener, roomId]);

  useEffect(() => {
    if (!enabled && isReady) {
      disconnect();
      setIsMuted(true);
    }
  }, [disconnect, enabled, isReady]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isReady,
    isMuted,
    activeSpeakerCount,
    remoteStreams,
    error,
    toggleMute,
  };
}
