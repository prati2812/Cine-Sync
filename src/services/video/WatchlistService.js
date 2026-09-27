import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, database } from '../../config/firebase';

const WATCHLIST_STORAGE_KEY = '@cine_watchlist_items';

let cachedWatchlist = null;
const subscribers = new Set();

const notifySubscribers = () => {
  const currentList = cachedWatchlist ? [...cachedWatchlist] : [];
  subscribers.forEach(cb => {
    try {
      cb(currentList);
    } catch (e) {
      console.warn('[WatchlistService] Subscriber callback error:', e);
    }
  });
};

const normalizeId = itemOrKey => {
  if (!itemOrKey) return '';
  if (typeof itemOrKey === 'string') return itemOrKey.trim();
  return (
    itemOrKey.streamUrl ||
    itemOrKey.mediaKey ||
    itemOrKey.id ||
    itemOrKey.roomId ||
    ''
  ).trim();
};

/**
 * Retrieves all items saved to Watch Later / Wishlist
 * Prioritizes local cache, then AsyncStorage, and syncs with Firebase
 */
export const getWatchlist = async () => {
  if (cachedWatchlist !== null) {
    return [...cachedWatchlist];
  }

  try {
    const raw = await AsyncStorage.getItem(WATCHLIST_STORAGE_KEY);
    let localList = [];
    if (raw) {
      localList = JSON.parse(raw);
    }

    // Attempt Firebase sync if user is signed in
    const currentUser = auth().currentUser;
    if (currentUser?.uid) {
      try {
        const snap = await database()
          .ref(`watchlist/${currentUser.uid}`)
          .once('value');
        const remoteData = snap.val();
        if (remoteData) {
          const remoteList = Object.values(remoteData);
          // Merge lists preserving unique mediaKey, preferring most recent addedAt
          const mergedMap = new Map();
          [...localList, ...remoteList].forEach(item => {
            const key = normalizeId(item);
            if (key) {
              const existing = mergedMap.get(key);
              if (!existing || (item.addedAt || 0) > (existing.addedAt || 0)) {
                mergedMap.set(key, item);
              }
            }
          });
          localList = Array.from(mergedMap.values());
          // Update local storage with merged copy
          await AsyncStorage.setItem(
            WATCHLIST_STORAGE_KEY,
            JSON.stringify(localList)
          );
        }
      } catch (fbErr) {
        // Silent catch for offline or network issues
      }
    }

    localList.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    cachedWatchlist = localList;
    return [...cachedWatchlist];
  } catch (err) {
    console.warn('[WatchlistService] Error loading watchlist:', err);
    return [];
  }
};

/**
 * Checks whether an item or streamUrl is currently in the watchlist
 */
export const isItemInWatchlist = (itemOrKey, currentList = null) => {
  const targetKey = normalizeId(itemOrKey);
  if (!targetKey) return false;

  const listToCheck = currentList || cachedWatchlist;
  if (!listToCheck) return false;

  return listToCheck.some(item => {
    const itemKey = normalizeId(item);
    return itemKey === targetKey || item.id === targetKey;
  });
};

/**
 * Adds an item to Watch Later / Wishlist
 */
export const addToWatchlist = async item => {
  if (!item) return false;
  const key = normalizeId(item);
  if (!key) return false;

  try {
    const current = await getWatchlist();
    const alreadyExists = current.some(i => normalizeId(i) === key);

    const newItem = {
      id: key,
      mediaKey: item.streamUrl || item.mediaKey || key,
      streamUrl: item.streamUrl || item.mediaKey || key,
      title: item.title || item.name || 'Cinema Screening',
      thumbnail: item.thumbnail || null,
      channelName: item.channelName || 'SyncLabs Cinema',
      duration: item.duration || '',
      views: item.views || '',
      addedAt: Date.now(),
      isSolo: true,
    };

    const updated = alreadyExists
      ? current.map(i => (normalizeId(i) === key ? newItem : i))
      : [newItem, ...current];

    cachedWatchlist = updated;
    await AsyncStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify(updated)
    );

    // Sync to Firebase if user is logged in
    const currentUser = auth().currentUser;
    if (currentUser?.uid) {
      try {
        const safeKey = encodeURIComponent(key).replace(/\./g, '%2E');
        await database()
          .ref(`watchlist/${currentUser.uid}/${safeKey}`)
          .set(newItem);
      } catch (fbErr) {
        // Ignore network errors in realtime background
      }
    }

    notifySubscribers();
    return true;
  } catch (err) {
    console.warn('[WatchlistService] Error adding to watchlist:', err);
    return false;
  }
};

/**
 * Removes an item from Watch Later / Wishlist
 */
export const removeFromWatchlist = async itemOrKey => {
  const targetKey = normalizeId(itemOrKey);
  if (!targetKey) return false;

  try {
    const current = await getWatchlist();
    const updated = current.filter(
      i => normalizeId(i) !== targetKey && i.id !== targetKey
    );

    cachedWatchlist = updated;
    await AsyncStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify(updated)
    );

    // Sync removal with Firebase
    const currentUser = auth().currentUser;
    if (currentUser?.uid) {
      try {
        const safeKey = encodeURIComponent(targetKey).replace(/\./g, '%2E');
        await database()
          .ref(`watchlist/${currentUser.uid}/${safeKey}`)
          .remove();
      } catch (fbErr) {
        // Ignore network errors
      }
    }

    notifySubscribers();
    return true;
  } catch (err) {
    console.warn('[WatchlistService] Error removing from watchlist:', err);
    return false;
  }
};

/**
 * Toggles an item in or out of the watchlist
 * Returns true if now in watchlist, false if removed
 */
export const toggleWatchlist = async item => {
  const key = normalizeId(item);
  if (!key) return false;

  const current = await getWatchlist();
  const exists = current.some(i => normalizeId(i) === key);

  if (exists) {
    await removeFromWatchlist(key);
    return false;
  } else {
    await addToWatchlist(item);
    return true;
  }
};

/**
 * Realtime subscriber pattern for components (StreamingScreen, LibraryScreen)
 */
export const subscribeWatchlist = callback => {
  subscribers.add(callback);
  // Promptly trigger initial load
  getWatchlist().then(list => {
    try {
      callback(list);
    } catch (e) {}
  });

  return () => {
    subscribers.delete(callback);
  };
};

export default {
  getWatchlist,
  isItemInWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  toggleWatchlist,
  subscribeWatchlist,
};
