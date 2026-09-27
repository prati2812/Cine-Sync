import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '../../config/firebase';

/**
 * CineSyncEngine
 * Production Dead-Reckoning Synchronization & Local Progress Service.
 *
 * Capabilities:
 * 1. Solo Mode (Personal Watching):
 *    - If watching alone, ZERO network requests are made to Firebase.
 *    - Automatically persists playback progress locally in AsyncStorage.
 *    - Seamlessly resumes playback from the exact saved second when re-opened.
 * 2. Synchronized Watch Party Mode (2,000+ Users):
 *    - Dead Reckoning: Only pushes state transitions (PLAY, PAUSE, SEEK).
 *    - Isolated Micro-Payload: Uses dedicated `rooms_playback/${roomId}` path (~60 bytes per packet).
 *    - Server Clock Offset: Eliminates device clock skew using `/.info/serverTimeOffset`.
 *    - Sub-second drift correction with zero audio stutter.
 */

const PROGRESS_KEY_PREFIX = '@cine_progress_';

// Global Server Clock Offset Tracking (Singleton)
let serverTimeOffset = 0;
let isOffsetInitialized = false;

export const initServerClock = () => {
  if (isOffsetInitialized) return;
  try {
    const offsetRef = database().ref('.info/serverTimeOffset');
    offsetRef.on('value', snapshot => {
      serverTimeOffset = snapshot.val() || 0;
      isOffsetInitialized = true;
    });
  } catch (err) {
    console.warn('[CineSyncEngine] Error initializing server time offset:', err);
  }
};

// Initialize server clock listener immediately
initServerClock();

/**
 * Returns estimated Firebase Server Timestamp in milliseconds
 */
export const getServerNow = () => Date.now() + serverTimeOffset;

/**
 * Calculates expected playback position in seconds using Dead Reckoning
 */
export const calculateDeadReckoningPosition = packet => {
  if (!packet) return 0;
  if (packet.state !== 'PLAY' || packet.isHostDisconnected) return packet.position || 0;

  const rate = packet.rate || 1.0;

  // 1. If packet was received live on this client, use monotonic local clock
  if (typeof packet._localReceivedAt === 'number') {
    const serverNow = getServerNow();
    const packetServerTime = packet.serverTime || serverNow;
    const serverElapsedSecs = Math.max(0, (serverNow - packetServerTime) / 1000);
    // If the packet was emitted > 4s ago on server, viewer joined an ongoing screening late
    if (serverElapsedSecs > 4.0) {
      const elapsedSinceArrival = Math.max(0, (Date.now() - packet._localReceivedAt) / 1000);
      return Math.max(0, (packet.position || 0) + (serverElapsedSecs + elapsedSinceArrival) * rate);
    }

    const elapsedLocalSecs = Math.max(0, (Date.now() - packet._localReceivedAt) / 1000);
    return Math.max(0, (packet.position || 0) + elapsedLocalSecs * rate);
  }

  // 2. Fallback for initial state before packet listener attaches
  const serverNow = getServerNow();
  const packetServerTime = packet.serverTime || serverNow;
  const elapsedSecs = Math.max(0, (serverNow - packetServerTime) / 1000);

  return Math.max(0, (packet.position || 0) + elapsedSecs * rate);
};

// ──────────────────────────────────────────────────────────────
// Local Playback Progress Persistence (AsyncStorage)
// ──────────────────────────────────────────────────────────────

/**
 * Saves video playback progress locally in AsyncStorage
 * Persists under mediaKey (streamUrl), extraKey (roomId), and dedicated room info.
 */
export const saveLocalProgress = async (mediaKey, currentTime, duration, extraKey = null, metadata = {}) => {
  if ((!mediaKey && !extraKey) || typeof currentTime !== 'number' || currentTime < 1) return;
  try {
    // If we have previous saved metadata, preserve it if current metadata fields are omitted
    let existingMeta = {};
    const primaryKey = mediaKey || extraKey;
    try {
      const prev = await AsyncStorage.getItem(`${PROGRESS_KEY_PREFIX}${encodeURIComponent(primaryKey)}`);
      if (prev) existingMeta = JSON.parse(prev);
    } catch (e) {}

    const data = {
      position: Math.floor(currentTime),
      duration: Math.floor(duration || 0),
      mediaKey: primaryKey,
      roomId: extraKey || existingMeta.roomId || null,
      updatedAt: Date.now(),
      title: metadata.title || existingMeta.title || null,
      thumbnail: metadata.thumbnail || existingMeta.thumbnail || null,
      channelName: metadata.channelName || existingMeta.channelName || null,
      isSolo: metadata.isSolo !== undefined ? metadata.isSolo : (existingMeta.isSolo !== undefined ? existingMeta.isSolo : !extraKey),
    };
    const jsonStr = JSON.stringify(data);

    // If video reached > 95% of duration, clear it (considered completed)
    if (duration > 0 && currentTime >= duration * 0.95) {
      if (mediaKey) {
        await AsyncStorage.removeItem(`${PROGRESS_KEY_PREFIX}${encodeURIComponent(mediaKey)}`);
      }
      if (extraKey) {
        await AsyncStorage.removeItem(`${PROGRESS_KEY_PREFIX}${encodeURIComponent(extraKey)}`);
        await AsyncStorage.removeItem(`@cine_room_last_playback_${encodeURIComponent(extraKey)}`);
      }
      return;
    }

    if (mediaKey) {
      await AsyncStorage.setItem(`${PROGRESS_KEY_PREFIX}${encodeURIComponent(mediaKey)}`, jsonStr);
    }
    if (extraKey && extraKey !== mediaKey) {
      await AsyncStorage.setItem(`${PROGRESS_KEY_PREFIX}${encodeURIComponent(extraKey)}`, jsonStr);
    }
    if (extraKey) {
      await AsyncStorage.setItem(`@cine_room_last_playback_${encodeURIComponent(extraKey)}`, jsonStr);
    }
  } catch (err) {
    // silent catch
  }
};

/**
 * Retrieves all in-progress continue watching items across all videos/rooms
 */
export const getAllContinueWatching = async () => {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const progressKeys = allKeys.filter(k => k.startsWith(PROGRESS_KEY_PREFIX));
    if (progressKeys.length === 0) return [];
    const pairs = await AsyncStorage.multiGet(progressKeys);
    const map = new Map();
    for (const [key, value] of pairs) {
      if (!value) continue;
      try {
        const item = JSON.parse(value);
        if (item && typeof item.position === 'number' && item.position >= 1) {
          const uniqueKey = item.mediaKey || item.roomId || key;
          if (!map.has(uniqueKey) || (item.updatedAt || 0) > (map.get(uniqueKey)?.updatedAt || 0)) {
            map.set(uniqueKey, item);
          }
        }
      } catch (e) {}
    }
    const list = Array.from(map.values());
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return list;
  } catch (err) {
    return [];
  }
};

/**
 * Removes a specific video from the continue watching queue
 */
export const removeContinueWatchingItem = async (mediaKey, extraKey = null) => {
  try {
    if (mediaKey) {
      await AsyncStorage.removeItem(`${PROGRESS_KEY_PREFIX}${encodeURIComponent(mediaKey)}`);
    }
    if (extraKey) {
      await AsyncStorage.removeItem(`${PROGRESS_KEY_PREFIX}${encodeURIComponent(extraKey)}`);
      await AsyncStorage.removeItem(`@cine_room_last_playback_${encodeURIComponent(extraKey)}`);
    }
  } catch (err) {}
};

/**
 * Retrieves saved playback progress locally
 * Checks primary mediaKey, then fallbackKey (roomId), then room playback info.
 */
export const getLocalProgress = async (mediaKey, fallbackKey = null) => {
  if (!mediaKey && !fallbackKey) return null;
  try {
    if (mediaKey) {
      const key = `${PROGRESS_KEY_PREFIX}${encodeURIComponent(mediaKey)}`;
      const saved = await AsyncStorage.getItem(key);
      if (saved) {
        const data = JSON.parse(saved);
        if (data && typeof data.position === 'number' && data.position >= 1) {
          return data;
        }
      }
    }
    if (fallbackKey && fallbackKey !== mediaKey) {
      const fbKey = `${PROGRESS_KEY_PREFIX}${encodeURIComponent(fallbackKey)}`;
      const saved = await AsyncStorage.getItem(fbKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data && typeof data.position === 'number' && data.position >= 1) {
          return data;
        }
      }
    }
    if (fallbackKey || mediaKey) {
      const roomKey = `@cine_room_last_playback_${encodeURIComponent(fallbackKey || mediaKey)}`;
      const saved = await AsyncStorage.getItem(roomKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data && typeof data.position === 'number' && data.position >= 1) {
          return data;
        }
      }
    }
  } catch (err) {
    // silent catch
  }
  return null;
};

/**
 * Clears saved playback progress locally
 */
export const clearLocalProgress = async (mediaKey, extraKey = null) => {
  try {
    if (mediaKey) {
      await AsyncStorage.removeItem(`${PROGRESS_KEY_PREFIX}${encodeURIComponent(mediaKey)}`);
    }
    if (extraKey) {
      await AsyncStorage.removeItem(`${PROGRESS_KEY_PREFIX}${encodeURIComponent(extraKey)}`);
      await AsyncStorage.removeItem(`@cine_room_last_playback_${encodeURIComponent(extraKey)}`);
    }
  } catch (err) {
    // silent catch
  }
};

// ──────────────────────────────────────────────────────────────
// CineSyncSession Class
// ──────────────────────────────────────────────────────────────

export class CineSyncSession {
  constructor({
    roomId,
    mediaKey,
    isHost = false,
    isSolo = false,
    playerRef,
    onSyncStatusChange,
    onRemotePlayStateChange,
    onResumeProgress,
  }) {
    this.roomId = roomId;
    this.mediaKey = mediaKey || roomId;
    this.isHost = isHost;
    this.isSolo = isSolo;
    this.playerRef = playerRef;
    this.onSyncStatusChange = onSyncStatusChange;
    this.onRemotePlayStateChange = onRemotePlayStateChange;
    this.onResumeProgress = onResumeProgress;

    this.version = 0;
    this.lastReceivedVersion = -1;
    this.lastPacket = null;
    this.isApplyingRemote = false;
    this.isSeekingLocally = false;
    this.seekCooldownUntil = 0;
    this.safetyHeartbeatInterval = null;
    this.lastProgressSaveTime = 0;
    this.syncRef = roomId ? database().ref(`rooms_playback/${roomId}`) : null;

    this.init();
  }

  async init() {
    initServerClock();

    // 1. Check local resume progress first (with roomId fallback)
    const saved = await getLocalProgress(this.mediaKey, this.roomId);
    if (saved && typeof saved.position === 'number' && saved.position >= 1) {
      if (this.onResumeProgress) {
        this.onResumeProgress(saved);
      } else if (this.playerRef?.current) {
        this.playerRef.current.seekTo(saved.position);
      }
    }

    // 2. Setup based on mode
    if (this.isSolo) {
      this.notifyStatus('SOLO_MODE', 0);
      return;
    }

    if (this.isHost) {
      // Host: Send a slow safety heartbeat once every 25 seconds as fail-safe
      this.safetyHeartbeatInterval = setInterval(() => {
        this.pushSafetyHeartbeat();
      }, 25000);
    } else {
      // Viewer: Subscribe to isolated micro-node
      this.initViewerSubscription();
    }
  }

  /**
   * Switch dynamically between Solo Mode and Group Watch Party Mode
   */
  setSolo(isSolo) {
    if (this.isSolo === isSolo) return;
    this.isSolo = isSolo;

    if (isSolo) {
      // Switched to Solo: cancel heartbeats and detach remote listeners
      if (this.safetyHeartbeatInterval) {
        clearInterval(this.safetyHeartbeatInterval);
        this.safetyHeartbeatInterval = null;
      }
      if (this.syncRef && !this.isHost) {
        this.syncRef.off('value');
      }
      this.notifyStatus('SOLO_MODE', 0);
    } else {
      // Switched to Party mode: initialize group sync
      if (this.isHost) {
        if (!this.safetyHeartbeatInterval) {
          this.safetyHeartbeatInterval = setInterval(() => {
            this.pushSafetyHeartbeat();
          }, 25000);
        }
      } else {
        this.initViewerSubscription();
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Host / Solo Dispatch Handlers
  // ──────────────────────────────────────────────────────────────

  /**
   * Play action triggered
   */
  async pushPlay(currentTime, duration) {
    // 1. Save progress locally
    saveLocalProgress(this.mediaKey, currentTime, duration, this.roomId);

    // 2. If Solo mode, do NOT touch Firebase!
    if (this.isSolo) {
      this.notifyStatus('SOLO_PLAYING', 0);
      return;
    }

    if (!this.isHost || !this.syncRef) return;

    let precisePos = currentTime;
    try {
      const cur = await this.playerRef?.current?.getCurrentTime();
      if (typeof cur === 'number' && cur >= 0) {
        precisePos = cur;
      }
    } catch (e) {}

    this.version += 1;
    const packet = {
      state: 'PLAY',
      position: Math.max(0, precisePos || 0),
      serverTime: database.ServerValue.TIMESTAMP,
      rate: 1.0,
      v: this.version,
    };
    this.lastPacket = { ...packet, serverTime: getServerNow() };

    try {
      await this.syncRef.set(packet);
      if (this.roomId) {
        database().ref(`rooms/${this.roomId}/playback`).update({
          currentTime: Math.max(0, precisePos || 0),
          isPlaying: true,
          lastUpdated: database.ServerValue.TIMESTAMP,
        }).catch(() => {});
      }
      this.notifyStatus('HOST_PLAYING', 0);
    } catch (err) {
      console.warn('[CineSyncEngine] Failed to push PLAY:', err);
    }
  }

  /**
   * Pause action triggered
   */
  async pushPause(currentTime, duration) {
    // 1. Save progress locally
    saveLocalProgress(this.mediaKey, currentTime, duration, this.roomId);

    // 2. If Solo mode, do NOT touch Firebase!
    if (this.isSolo) {
      this.notifyStatus('SOLO_PAUSED', 0);
      return;
    }

    if (!this.isHost || !this.syncRef) return;

    let precisePos = currentTime;
    try {
      const cur = await this.playerRef?.current?.getCurrentTime();
      if (typeof cur === 'number' && cur >= 0) {
        precisePos = cur;
      }
    } catch (e) {}

    this.version += 1;
    const packet = {
      state: 'PAUSE',
      position: Math.max(0, precisePos || 0),
      serverTime: database.ServerValue.TIMESTAMP,
      rate: 1.0,
      v: this.version,
    };
    this.lastPacket = { ...packet, serverTime: getServerNow() };

    try {
      await this.syncRef.set(packet);
      if (this.roomId) {
        database().ref(`rooms/${this.roomId}/playback`).update({
          currentTime: Math.max(0, precisePos || 0),
          isPlaying: false,
          lastUpdated: database.ServerValue.TIMESTAMP,
        }).catch(() => {});
      }
      this.notifyStatus('HOST_PAUSED', 0);
    } catch (err) {
      console.warn('[CineSyncEngine] Failed to push PAUSE:', err);
    }
  }

  /**
   * Seek action triggered
   */
  async pushSeek(targetSeconds, isPlaying, duration) {
    // 1. Save progress locally
    saveLocalProgress(this.mediaKey, targetSeconds, duration, this.roomId);

    // 2. If Solo mode, do NOT touch Firebase!
    if (this.isSolo) {
      this.notifyStatus(isPlaying ? 'SOLO_PLAYING' : 'SOLO_PAUSED', 0);
      return;
    }

    if (!this.isHost || !this.syncRef) return;
    this.version += 1;
    const packet = {
      state: isPlaying ? 'PLAY' : 'PAUSE',
      position: Math.max(0, targetSeconds || 0),
      serverTime: database.ServerValue.TIMESTAMP,
      rate: 1.0,
      v: this.version,
    };
    this.lastPacket = { ...packet, serverTime: getServerNow() };

    try {
      await this.syncRef.set(packet);
      if (this.roomId) {
        database().ref(`rooms/${this.roomId}/playback`).update({
          currentTime: Math.max(0, targetSeconds || 0),
          isPlaying: Boolean(isPlaying),
          lastUpdated: database.ServerValue.TIMESTAMP,
        }).catch(() => {});
      }
      this.notifyStatus(isPlaying ? 'HOST_PLAYING' : 'HOST_PAUSED', 0);
    } catch (err) {
      console.warn('[CineSyncEngine] Failed to push SEEK:', err);
    }
  }

  /**
   * Safety heartbeat (only 1 packet every 25s when host is playing)
   */
  async pushSafetyHeartbeat() {
    if (this.isSolo || !this.isHost || !this.syncRef || !this.lastPacket || this.lastPacket.state !== 'PLAY') return;
    try {
      const curTime = await this.playerRef?.current?.getCurrentTime();
      if (typeof curTime === 'number' && curTime > 0) {
        this.version += 1;
        await this.syncRef.update({
          position: curTime,
          serverTime: database.ServerValue.TIMESTAMP,
          v: this.version,
        });
      }
    } catch (err) {
      // silent catch
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Viewer Subscription & Dead-Reckoning Receiver
  // ──────────────────────────────────────────────────────────────

  initViewerSubscription() {
    if (!this.syncRef) return;

    this.syncRef.on('value', async snapshot => {
      const packet = snapshot.val();
      if (!packet) return;

      // Discard older out-of-order packets
      if (typeof packet.v === 'number' && packet.v <= this.lastReceivedVersion) {
        return;
      }
      this.lastReceivedVersion = packet.v || 0;
      // Stamp local monotonic arrival time to eliminate cross-device clock skew
      packet._localReceivedAt = Date.now();
      this.lastPacket = packet;

      this.isApplyingRemote = true;
      try {
        await this.realignToHost(true);
      } finally {
        setTimeout(() => {
          this.isApplyingRemote = false;
        }, 500);
      }
    });
  }

  /**
   * Re-aligns viewer playback to the host's extrapolated Dead Reckoning timestamp.
   * Accounts for any elapsed buffering or loading time.
   */
  async realignToHost(force = false) {
    if (!this.lastPacket || this.isHost || this.isSolo) return;
    const now = Date.now();
    if (!force && (this.isSeekingLocally || now < this.seekCooldownUntil)) return;

    try {
      if (this.lastPacket.state === 'PAUSE' || this.lastPacket.isHostDisconnected) {
        if (this.onRemotePlayStateChange) {
          this.onRemotePlayStateChange(false);
        }
        if (this.playerRef?.current) {
          this.playerRef.current.pause();
          const viewerCurrent = (await this.playerRef.current.getCurrentTime()) || 0;
          const targetPos = this.lastPacket.position || 0;
          // Only seek if paused at a noticeable difference (> 0.35s) to avoid buffer-clearing churn
          if (Math.abs(viewerCurrent - targetPos) > 0.35) {
            this.playerRef.current.seekTo(targetPos);
          }
        }
        this.notifyStatus('SYNC_LOCKED', 0);
        return;
      }

      if (this.lastPacket.state === 'PLAY') {
        if (this.onRemotePlayStateChange) {
          this.onRemotePlayStateChange(true);
        }
        const targetTime = calculateDeadReckoningPosition(this.lastPacket);
        if (this.playerRef?.current) {
          this.playerRef.current.play();
          const viewerCurrent = (await this.playerRef.current.getCurrentTime()) || 0;
          const drift = Math.abs(viewerCurrent - targetTime);

          // CRITICAL ZERO-LAG OPTIMIZATION:
          // If viewer is already within 0.4s of targetTime, calling seekTo flushes
          // ExoPlayer's decoder buffers and causes an artificial 1.5s freeze.
          // Simply calling play() starts playback synchronously in < 20ms.
          if (drift > 0.4) {
            this.isSeekingLocally = true;
            this.seekCooldownUntil = now + 1200;
            this.playerRef.current.seekTo(targetTime);
            setTimeout(() => {
              this.isSeekingLocally = false;
            }, 1200);
          }
        }
        this.notifyStatus('SYNC_LOCKED', 0);
      }
    } catch (err) {
      console.warn('[CineSyncEngine] Error in realignToHost:', err);
    }
  }

  /**
   * Checks current viewer drift against the host's extrapolated frame,
   * or periodically persists progress in Solo mode.
   * Call this in the player's onProgress tick (~every 300ms).
   */
  async checkDrift(viewerCurrentTime, duration = 0) {
    const now = Date.now();

    // In Solo mode or for Host: Throttled save every 5 seconds
    if (this.isSolo || this.isHost) {
      if (now - this.lastProgressSaveTime > 5000) {
        this.lastProgressSaveTime = now;
        saveLocalProgress(this.mediaKey, viewerCurrentTime, duration, this.roomId);
      }
      return { isSynced: true, driftSeconds: 0, isSolo: this.isSolo };
    }

    // In Viewer mode: Dead-Reckoning alignment check
    if (!this.lastPacket || this.isApplyingRemote || this.isSeekingLocally) return;
    if (now < this.seekCooldownUntil) return;
    if (this.lastPacket.state !== 'PLAY' || this.lastPacket.isHostDisconnected) return;

    const expectedHostTime = calculateDeadReckoningPosition(this.lastPacket);
    const driftSeconds = Math.abs((viewerCurrentTime || 0) - expectedHostTime);

    // If drift exceeds 1.0s (noticeable lag), smoothly re-align with seek cooldown
    if (driftSeconds > 1.0) {
      this.notifyStatus('RE_SYNCING', driftSeconds);
      if (this.playerRef?.current) {
        this.isSeekingLocally = true;
        this.seekCooldownUntil = now + 1500;
        this.playerRef.current.seekTo(expectedHostTime);
        setTimeout(() => {
          this.isSeekingLocally = false;
        }, 1500);
      }
    } else {
      this.notifyStatus('SYNC_LOCKED', driftSeconds);
    }

    return {
      isSynced: driftSeconds <= 0.65,
      driftSeconds,
      expectedHostTime,
    };
  }

  notifyStatus(status, drift = 0) {
    if (this.onSyncStatusChange) {
      const isSolo = status.startsWith('SOLO_');
      this.onSyncStatusChange({
        status,
        driftMs: Math.round(drift * 1000),
        isSynced: isSolo || status === 'SYNC_LOCKED' || status === 'HOST_PLAYING' || status === 'HOST_PAUSED',
        isSolo,
      });
    }
  }

  destroy(lastPosition = null, duration = null) {
    if (typeof lastPosition === 'number' && lastPosition >= 1) {
      saveLocalProgress(this.mediaKey, lastPosition, duration, this.roomId);
    }
    if (this.safetyHeartbeatInterval) {
      clearInterval(this.safetyHeartbeatInterval);
      this.safetyHeartbeatInterval = null;
    }
    if (this.syncRef && !this.isHost) {
      this.syncRef.off('value');
    }
  }
}

export const createSyncSession = options => new CineSyncSession(options);

export default {
  initServerClock,
  getServerNow,
  calculateDeadReckoningPosition,
  saveLocalProgress,
  getLocalProgress,
  clearLocalProgress,
  CineSyncSession,
  createSyncSession,
};
