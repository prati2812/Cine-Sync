import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '../config/firebase';

const PASSCODE_KEY_PREFIX = '@cine_chat_lock_passcode_';
const LOCKED_USERS_KEY_PREFIX = '@cine_chat_locked_users_';

// In-memory active session cache (cleared when app restarts or user logs out)
const sessionUnlockedTargets = new Set();
let sessionVaultUnlocked = false;

/**
 * Retrieves the set of user IDs whose chats are locked by the current user.
 * Reads from AsyncStorage first; if empty (e.g. cache cleared), restores from Firebase RTDB.
 * @param {string} currentUid 
 * @returns {Promise<string[]>}
 */
export const getLockedUserIds = async (currentUid) => {
  if (!currentUid) return [];
  try {
    const raw = await AsyncStorage.getItem(`${LOCKED_USERS_KEY_PREFIX}${currentUid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }

    // Fallback: If cache was cleared or empty, restore from Firebase Realtime Database
    const snapshot = await database().ref(`user_chat_locks/${currentUid}/lockedUsers`).once('value');
    if (snapshot.exists()) {
      const data = snapshot.val();
      const ids = typeof data === 'object' && data !== null ? Object.keys(data).filter((k) => data[k]) : [];
      await AsyncStorage.setItem(`${LOCKED_USERS_KEY_PREFIX}${currentUid}`, JSON.stringify(ids));
      return ids;
    }
  } catch (err) {
    console.warn('[chatLockService] Error reading locked user IDs:', err);
  }
  return [];
};

/**
 * Checks if a specific person's chat is currently locked
 * @param {string} currentUid 
 * @param {string} targetUserId 
 * @returns {Promise<boolean>}
 */
export const isChatLockedForUser = async (currentUid, targetUserId) => {
  if (!currentUid || !targetUserId) return false;
  const list = await getLockedUserIds(currentUid);
  return list.includes(targetUserId);
};

/**
 * Locks a specific person's chat (persists both in AsyncStorage and Firebase RTDB)
 * @param {string} currentUid 
 * @param {string} targetUserId 
 * @param {string} [chatId] Optional RTDB chatId to sync metadata
 * @returns {Promise<string[]>}
 */
export const lockChatForUser = async (currentUid, targetUserId, chatId = null) => {
  if (!currentUid || !targetUserId) return [];
  try {
    const existing = await getLockedUserIds(currentUid);
    const updated = existing.includes(targetUserId) ? existing : [...existing, targetUserId];

    // 1. Save to local AsyncStorage for instant access
    await AsyncStorage.setItem(`${LOCKED_USERS_KEY_PREFIX}${currentUid}`, JSON.stringify(updated));

    // 2. Persist to Firebase Realtime Database so it survives cache clearing & device changes
    await database().ref(`user_chat_locks/${currentUid}/lockedUsers/${targetUserId}`).set(true).catch(() => {});

    // 3. Sync to user_chats in RTDB if chatId provided
    if (chatId) {
      database().ref(`user_chats/${currentUid}/${chatId}/isLocked`).set(true).catch(() => {});
    }

    return updated;
  } catch (err) {
    console.warn('[chatLockService] Error locking chat:', err);
    return [];
  }
};

/**
 * Unlocks / removes a specific person's chat from the locked list (removes from both local and cloud)
 * @param {string} currentUid 
 * @param {string} targetUserId 
 * @param {string} [chatId] Optional RTDB chatId to sync metadata
 * @returns {Promise<string[]>}
 */
export const unlockChatForUser = async (currentUid, targetUserId, chatId = null) => {
  if (!currentUid || !targetUserId) return [];
  try {
    const existing = await getLockedUserIds(currentUid);
    const updated = existing.filter((id) => id !== targetUserId);

    // 1. Remove from local AsyncStorage
    await AsyncStorage.setItem(`${LOCKED_USERS_KEY_PREFIX}${currentUid}`, JSON.stringify(updated));
    sessionUnlockedTargets.delete(targetUserId);

    // 2. Remove from Firebase Realtime Database
    await database().ref(`user_chat_locks/${currentUid}/lockedUsers/${targetUserId}`).remove().catch(() => {});

    // 3. Update user_chats in RTDB
    if (chatId) {
      database().ref(`user_chats/${currentUid}/${chatId}/isLocked`).set(false).catch(() => {});
    }

    return updated;
  } catch (err) {
    console.warn('[chatLockService] Error unlocking chat:', err);
    return [];
  }
};

/**
 * Checks if an alphanumeric passcode has been configured for the current user.
 * If local cache is cleared, checks Firebase Realtime Database and restores cache.
 * @param {string} currentUid 
 * @returns {Promise<boolean>}
 */
export const hasChatLockPasscode = async (currentUid) => {
  if (!currentUid) return false;
  try {
    const localPasscode = await AsyncStorage.getItem(`${PASSCODE_KEY_PREFIX}${currentUid}`);
    if (localPasscode && localPasscode.length > 0) {
      return true;
    }

    // Fallback to cloud database if cache was cleared
    const snapshot = await database().ref(`user_chat_locks/${currentUid}/passcode`).once('value');
    if (snapshot.exists()) {
      const cloudPasscode = snapshot.val();
      if (cloudPasscode && String(cloudPasscode).length > 0) {
        await AsyncStorage.setItem(`${PASSCODE_KEY_PREFIX}${currentUid}`, String(cloudPasscode).trim());
        return true;
      }
    }
  } catch (err) {
    console.warn('[chatLockService] Error checking passcode existence:', err);
  }
  return false;
};

/**
 * Saves a new custom alphanumeric passcode to both AsyncStorage and Firebase Realtime Database
 * @param {string} currentUid 
 * @param {string} passcode 
 * @returns {Promise<boolean>}
 */
export const setChatLockPasscode = async (currentUid, passcode) => {
  if (!currentUid || !passcode) return false;
  const cleanPasscode = passcode.trim();
  try {
    // 1. Save to local AsyncStorage
    await AsyncStorage.setItem(`${PASSCODE_KEY_PREFIX}${currentUid}`, cleanPasscode);

    // 2. Save to Firebase Realtime Database so it survives cache clearing & device swaps
    await database().ref(`user_chat_locks/${currentUid}/passcode`).set(cleanPasscode);

    return true;
  } catch (err) {
    console.warn('[chatLockService] Error saving passcode to database:', err);
    // Still succeeded locally if AsyncStorage saved
    return true;
  }
};

/**
 * Validates an entered alphanumeric passcode against the stored passcode.
 * If local cache is missing, fetches and restores from Firebase Realtime Database.
 * @param {string} currentUid 
 * @param {string} enteredPasscode 
 * @returns {Promise<boolean>}
 */
export const verifyChatLockPasscode = async (currentUid, enteredPasscode) => {
  if (!currentUid || !enteredPasscode) return false;
  const cleanEntered = enteredPasscode.trim();
  try {
    let stored = await AsyncStorage.getItem(`${PASSCODE_KEY_PREFIX}${currentUid}`);
    if (!stored) {
      // Restore from Firebase RTDB
      const snapshot = await database().ref(`user_chat_locks/${currentUid}/passcode`).once('value');
      if (snapshot.exists()) {
        stored = String(snapshot.val()).trim();
        await AsyncStorage.setItem(`${PASSCODE_KEY_PREFIX}${currentUid}`, stored);
      }
    }

    return Boolean(stored && stored === cleanEntered);
  } catch (err) {
    console.warn('[chatLockService] Error verifying passcode:', err);
    return false;
  }
};

/**
 * Real-time listener for locked chats synchronization across devices / sessions
 * @param {string} currentUid 
 * @param {(lockedIds: string[]) => void} callback 
 * @returns {() => void} Unsubscribe function
 */
export const subscribeUserLockedChats = (currentUid, callback) => {
  if (!currentUid || typeof callback !== 'function') return () => {};

  const ref = database().ref(`user_chat_locks/${currentUid}/lockedUsers`);
  const onValueChange = ref.on('value', (snapshot) => {
    const data = snapshot.val();
    const ids = typeof data === 'object' && data !== null ? Object.keys(data).filter((k) => data[k]) : [];
    // Sync to local AsyncStorage in background
    AsyncStorage.setItem(`${LOCKED_USERS_KEY_PREFIX}${currentUid}`, JSON.stringify(ids)).catch(() => {});
    callback(ids);
  });

  return () => {
    ref.off('value', onValueChange);
  };
};

// ── In-Memory Active Session Unlock Helpers ──────────────────
export const markSessionUnlocked = (targetUserId) => {
  if (targetUserId) {
    sessionUnlockedTargets.add(targetUserId);
  }
};

export const isSessionUnlocked = (targetUserId) => {
  if (!targetUserId) return false;
  return sessionUnlockedTargets.has(targetUserId) || sessionVaultUnlocked;
};

export const setVaultSessionUnlocked = (unlocked) => {
  sessionVaultUnlocked = Boolean(unlocked);
};

export const isVaultSessionUnlocked = () => {
  return sessionVaultUnlocked;
};

export const clearSessionUnlocks = () => {
  sessionUnlockedTargets.clear();
  sessionVaultUnlocked = false;
};
