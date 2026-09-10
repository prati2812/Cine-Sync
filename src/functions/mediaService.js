import RNFS from 'react-native-fs';
import { database } from '../config/firebase';

const MEDIA_CACHE_DIR = `${RNFS.CachesDirectoryPath}/cine_media`;

// Ensure local media cache directory exists
const ensureCacheDir = async () => {
  try {
    const exists = await RNFS.exists(MEDIA_CACHE_DIR);
    if (!exists) {
      await RNFS.mkdir(MEDIA_CACHE_DIR);
    }
  } catch (err) {
    console.warn('[mediaService] Error creating media cache dir:', err);
  }
};

/**
 * Upload a compressed base64 image into RTDB's decoupled media_blobs node
 * and save it immediately into the device's local disk cache.
 *
 * @param {string} base64Data Full data URI (data:image/jpeg;base64,...)
 * @param {string} senderId Current user UID
 * @returns {Promise<string>} mediaId
 */
export const uploadMediaBlob = async (base64Data, senderId) => {
  if (!base64Data) return null;
  await ensureCacheDir();

  const rootRef = database().ref();
  const mediaKey = rootRef.child('media_blobs').push().key;

  // 1. Save to local disk cache first so sender never needs to download it
  try {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const localFilePath = `${MEDIA_CACHE_DIR}/${mediaKey}.jpg`;
    await RNFS.writeFile(localFilePath, cleanBase64, 'base64');
  } catch (cacheErr) {
    console.warn('[mediaService] Local cache write error:', cacheErr);
  }

  // 2. Write to decoupled media_blobs in RTDB
  await rootRef.child(`media_blobs/${mediaKey}`).set({
    mediaId: mediaKey,
    base64: base64Data,
    senderId: senderId,
    createdAt: database.ServerValue.TIMESTAMP,
  });

  return mediaKey;
};

/**
 * Resolve an image's displayable URI:
 * 1. Checks local disk cache first (0 network bandwidth, instant render).
 * 2. If missing, fetches base64 from RTDB once, caches to disk, and returns file URI.
 * 3. Falls back to provided fallbackUri if available (for backward compatibility).
 *
 * @param {string} mediaId Decoupled blob identifier
 * @param {string} fallbackUri Existing inline imageUri if present
 * @returns {Promise<string|null>} file:// URI or fallback data URI
 */
export const resolveMediaUri = async (mediaId, fallbackUri = null) => {
  if (!mediaId) {
    return fallbackUri || null;
  }

  await ensureCacheDir();
  const localFilePath = `${MEDIA_CACHE_DIR}/${mediaId}.jpg`;

  try {
    // 1. Fast path: check local disk cache
    const exists = await RNFS.exists(localFilePath);
    if (exists) {
      return `file://${localFilePath}`;
    }

    // 2. Fetch from RTDB on-demand
    const snapshot = await database().ref(`media_blobs/${mediaId}/base64`).once('value');
    const base64Data = snapshot.val();
    if (!base64Data) {
      return fallbackUri || null;
    }

    // 3. Save to disk cache for future views
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    await RNFS.writeFile(localFilePath, cleanBase64, 'base64');

    return `file://${localFilePath}`;
  } catch (err) {
    console.warn('[mediaService] Error resolving media URI:', err);
    return fallbackUri || null;
  }
};

/**
 * Delete a media blob from RTDB (used for view-once photos & cleanup).
 *
 * @param {string} mediaId Decoupled blob identifier
 */
export const deleteMediaBlob = async (mediaId) => {
  if (!mediaId) return;
  try {
    // 1. Remove from RTDB to reclaim storage
    await database().ref(`media_blobs/${mediaId}`).remove();

    // 2. Remove from local disk cache
    const localFilePath = `${MEDIA_CACHE_DIR}/${mediaId}.jpg`;
    const exists = await RNFS.exists(localFilePath);
    if (exists) {
      await RNFS.unlink(localFilePath);
    }
  } catch (err) {
    console.warn('[mediaService] Error deleting media blob:', err);
  }
};
