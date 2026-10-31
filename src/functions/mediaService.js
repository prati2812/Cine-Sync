import RNFS from 'react-native-fs';
import { database } from '../config/firebase';

export const PERMANENT_MEDIA_DIR = `${RNFS.DocumentDirectoryPath}/CineSync_Media`;
export const LEGACY_CACHE_DIR = `${RNFS.CachesDirectoryPath}/cine_media`;

// Ensure local media directory exists (bulletproof for both Android & iOS)
const ensureMediaDir = async () => {
  try {
    const permExists = await RNFS.exists(PERMANENT_MEDIA_DIR);
    if (!permExists) {
      await RNFS.mkdir(PERMANENT_MEDIA_DIR);
    }
  } catch (err) {
    console.warn('[mediaService] Error creating permanent media dir:', err);
  }

  try {
    const cacheExists = await RNFS.exists(LEGACY_CACHE_DIR);
    if (!cacheExists) {
      await RNFS.mkdir(LEGACY_CACHE_DIR);
    }
  } catch (cErr) {
    console.warn('[mediaService] Error creating legacy cache dir:', cErr);
  }
};

/**
 * Upload an uncompressed image into RTDB's ephemeral media_relay node
 * and save it immediately into the device's permanent local storage.
 *
 * @param {string} base64Data Full data URI (data:image/jpeg;base64,...)
 * @param {string} senderId Current user UID
 * @returns {Promise<string>} mediaId
 */
export const uploadMediaBlob = async (base64Data, senderId) => {
  if (!base64Data) return null;
  await ensureMediaDir();

  const rootRef = database().ref();
  const mediaKey = rootRef.child('media_relay').push().key;

  // 1. Save to sender's permanent local storage so sender has the file locally forever
  try {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const localFilePath = `${PERMANENT_MEDIA_DIR}/${mediaKey}.jpg`;
    await RNFS.writeFile(localFilePath, cleanBase64, 'base64');
  } catch (saveErr) {
    console.warn('[mediaService] Local permanent save error, attempting fallback cache:', saveErr);
    try {
      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
      await RNFS.writeFile(`${LEGACY_CACHE_DIR}/${mediaKey}.jpg`, cleanBase64, 'base64');
    } catch (fallbackErr) {
      console.warn('[mediaService] Local fallback write error:', fallbackErr);
    }
  }

  // 2. Write to ephemeral media_relay in RTDB (transit holding pen)
  await rootRef.child(`media_relay/${mediaKey}`).set({
    mediaId: mediaKey,
    base64: base64Data,
    senderId: senderId,
    createdAt: database.ServerValue.TIMESTAMP,
  });

  return mediaKey;
};

/**
 * Resolve an image's displayable URI (WhatsApp Architecture + Backward Compatibility):
 * 1. Fast path: checks permanent local disk (0 network bandwidth, instant render).
 * 2. Checks legacy cache directory (migrates existing cached file to permanent directory).
 * 3. Fetches from new ephemeral node: media_relay/{mediaId}.
 *    -> Once fetched, saves permanently to local disk, THEN immediately deletes
 *       the blob from media_relay (WhatsApp Auto-Purge!).
 * 4. Backward compatibility: if not in media_relay, falls back to legacy media_blobs/{mediaId}.
 *    -> Saves permanently to local disk so it is migrated locally, and DOES NOT delete
 *       from media_blobs (preserving old user data on cloud!).
 * 5. Falls back to provided fallbackUri if available (for legacy inline imageUri).
 *
 * @param {string} mediaId Decoupled blob identifier
 * @param {string} fallbackUri Existing inline imageUri if present
 * @param {boolean} isRecipient True if current device is recipient
 * @returns {Promise<string|null>} file:// URI or fallback data URI
 */
export const resolveMediaUri = async (mediaId, fallbackUri = null, isRecipient = false) => {
  if (!mediaId) {
    return fallbackUri || null;
  }

  await ensureMediaDir();
  const localPermanentPath = `${PERMANENT_MEDIA_DIR}/${mediaId}.jpg`;
  const legacyCachePath = `${LEGACY_CACHE_DIR}/${mediaId}.jpg`;

  try {
    // 1. Fast path: check local permanent storage (Instant 0ms, 0 network)
    const permExists = await RNFS.exists(localPermanentPath);
    if (permExists) {
      if (isRecipient) {
        // If recipient already has it locally (e.g. same test device), ensure relay node is purged
        database().ref(`media_relay/${mediaId}`).remove().catch(() => { });
      }
      return `file://${localPermanentPath}`;
    }

    // 2. Check legacy cache directory (if user previously received it before migration)
    const legacyExists = await RNFS.exists(legacyCachePath);
    if (legacyExists) {
      try {
        await RNFS.copyFile(legacyCachePath, localPermanentPath);
        if (isRecipient) {
          database().ref(`media_relay/${mediaId}`).remove().catch(() => { });
        }
        return `file://${localPermanentPath}`;
      } catch {
        return `file://${legacyCachePath}`;
      }
    }

    // 3. Fetch from new ephemeral media_relay in RTDB
    const relaySnapshot = await database().ref(`media_relay/${mediaId}/base64`).once('value');
    let base64Data = relaySnapshot.val();
    let isFromRelay = false;

    if (base64Data) {
      isFromRelay = true;
    } else {
      // 4. Backward compatibility: fetch from legacy media_blobs in RTDB (old user data)
      const blobSnapshot = await database().ref(`media_blobs/${mediaId}/base64`).once('value');
      base64Data = blobSnapshot.val();
    }

    if (!base64Data) {
      return fallbackUri || null;
    }

    // 5. Save permanently to local storage (with fallback to cache directory)
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    let finalPath = localPermanentPath;
    try {
      await RNFS.writeFile(localPermanentPath, cleanBase64, 'base64');
    } catch (writeErr) {
      console.warn('[mediaService] Error writing to permanent dir, trying cache:', writeErr);
      try {
        await RNFS.writeFile(legacyCachePath, cleanBase64, 'base64');
        finalPath = legacyCachePath;
      } catch (cacheErr) {
        console.warn('[mediaService] Error writing to fallback cache dir:', cacheErr);
      }
    }

    // 6. WHATSAPP AUTO-PURGE:
    // If it was downloaded from ephemeral media_relay, purge it immediately from Firebase RTDB!
    if (isFromRelay) {
      database().ref(`media_relay/${mediaId}`).remove().catch((purgeErr) => {
        console.warn('[mediaService] Error auto-purging media_relay:', purgeErr);
      });
    }

    return `file://${finalPath}`;
  } catch (err) {
    console.warn('[mediaService] Error resolving media URI:', err);
    return fallbackUri || null;
  }
};

/**
 * Delete a media blob (used for view-once photos & manual cleanup).
 * Purges both ephemeral media_relay, legacy media_blobs, and local disk files.
 *
 * @param {string} mediaId Decoupled blob identifier
 */
export const deleteMediaBlob = async (mediaId) => {
  if (!mediaId) return;
  try {
    // 1. Remove from RTDB (both relay and blobs)
    await Promise.all([
      database().ref(`media_relay/${mediaId}`).remove().catch(() => { }),
      database().ref(`media_blobs/${mediaId}`).remove().catch(() => { }),
    ]);

    // 2. Remove from local permanent disk and legacy cache
    const permPath = `${PERMANENT_MEDIA_DIR}/${mediaId}.jpg`;
    if (await RNFS.exists(permPath)) {
      await RNFS.unlink(permPath).catch(() => { });
    }
    const legacyPath = `${LEGACY_CACHE_DIR}/${mediaId}.jpg`;
    if (await RNFS.exists(legacyPath)) {
      await RNFS.unlink(legacyPath).catch(() => { });
    }
  } catch (err) {
    console.warn('[mediaService] Error deleting media blob:', err);
  }
};
