export * from './youtubeThumbnail';

export const getYoutubeVideoId = url => {
    const regExp =
      /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url ? url.match(regExp) : null;
    return match && match[7] && match[7].length === 11 ? match[7] : false;
};

export const formatTime = seconds => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

/**
 * Utility: Decode HTML entities from scraped meta tags or oEmbed
 */
export const decodeHtmlEntities = str => {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
};

/**
 * Fetch video/media title, channel/author, and thumbnail from URL.
 * Supports YouTube oEmbed, Vimeo oEmbed, direct media links (.mp4/.m3u8), and HTML <title>.
 */
export const fetchMediaMetadata = async url => {
  if (!url || typeof url !== 'string') return null;
  const trimmedUrl = url.trim();
  if (trimmedUrl.length < 5) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const lowerUrl = trimmedUrl.toLowerCase();
    const isYouTube = lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be');

    // 1. YouTube oEmbed
    if (isYouTube) {
      const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(trimmedUrl)}&format=json`;
      const res = await fetch(oEmbedUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        return {
          title: data.title ? decodeHtmlEntities(data.title) : null,
          author: data.author_name ? decodeHtmlEntities(data.author_name) : null,
          thumbnail: data.thumbnail_url || null,
        };
      }
    }

    // 2. Vimeo oEmbed
    if (lowerUrl.includes('vimeo.com')) {
      const vimeoUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(trimmedUrl)}`;
      const res = await fetch(vimeoUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        return {
          title: data.title ? decodeHtmlEntities(data.title) : null,
          author: data.author_name ? decodeHtmlEntities(data.author_name) : null,
          thumbnail: data.thumbnail_url || null,
        };
      }
    }

    // 3. Direct Media filename detection (.mp4, .m3u8, .mov, etc.)
    const mediaMatch = trimmedUrl.match(/\/([^\/?#]+)\.(mp4|m3u8|mov|webm|mkv)/i);
    if (mediaMatch && mediaMatch[1]) {
      clearTimeout(timeoutId);
      const cleanName = decodeURIComponent(mediaMatch[1])
        .replace(/[-_]+/g, ' ')
        .trim();
      return {
        title: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
        author: null,
        thumbnail: null,
      };
    }

    // 4. Generic Webpage HTML title scrape
    if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
      const res = await fetch(trimmedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const html = await res.text();
        const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        const rawTitle = ogTitleMatch?.[1] || titleMatch?.[1];
        if (rawTitle) {
          return {
            title: decodeHtmlEntities(rawTitle.trim()),
            author: null,
            thumbnail: null,
          };
        }
      }
    }
  } catch (err) {
    // Abort or network error - ignore gracefully
  } finally {
    clearTimeout(timeoutId);
  }

  return null;
};

/**
 * Safely extract participant emails/identities into an array,
 * handling both Firebase array format and object/dictionary format.
 */
export const getRoomParticipantEmails = (participants) => {
  if (!participants) return [];
  if (Array.isArray(participants)) {
    return participants
      .map(p => (typeof p === 'string' ? p : p?.email))
      .filter(Boolean);
  }
  if (typeof participants === 'object') {
    return Object.entries(participants)
      .map(([key, val]) => {
        if (typeof val === 'string') return val;
        if (val && typeof val === 'object' && val.email) return val.email;
        if (key && key.includes('@')) return key;
        return null;
      })
      .filter(Boolean);
  }
  return [];
};

/**
 * Safely get the number of participants in a room.
 */
export const getRoomParticipantCount = (roomOrParticipants) => {
  if (!roomOrParticipants) return 0;
  const participants =
    roomOrParticipants.participants !== undefined
      ? roomOrParticipants.participants
      : roomOrParticipants;
  if (!participants) return 0;
  if (Array.isArray(participants)) {
    return participants.length;
  }
  if (typeof participants === 'object') {
    return Object.keys(participants).length;
  }
  return 0;
};

/**
 * Safely check if a user is a participant of a room.
 * Handles array of strings/objects, object dictionaries keyed by UID/email, or object values.
 */
export const isUserParticipant = (room, user) => {
  if (!room || !user) return false;
  const userEmail = (user.email || '').toLowerCase().trim();
  const userUid = user.uid || '';

  const { participants } = room;
  if (!participants) return false;

  // 1. Array format: ['user@example.com', ...] or [{ email, uid }, ...]
  if (Array.isArray(participants)) {
    return participants.some(p => {
      if (typeof p === 'string') {
        const pTrim = p.toLowerCase().trim();
        return (userEmail && pTrim === userEmail) || (userUid && p === userUid);
      }
      if (p && typeof p === 'object') {
        const pEmail = (p.email || '').toLowerCase().trim();
        return (userEmail && pEmail === userEmail) || (userUid && p.uid === userUid);
      }
      return false;
    });
  }

  // 2. Object format: { [uid]: true }, { [email]: true }, or { "0": "email", ... }
  if (typeof participants === 'object') {
    // Direct key lookup
    if (userUid && participants[userUid]) return true;
    if (userEmail && participants[userEmail]) return true;

    // Iterate entries
    return Object.entries(participants).some(([key, val]) => {
      const keyTrim = key.toLowerCase().trim();
      if (userUid && key === userUid) return true;
      if (userEmail && keyTrim === userEmail) return true;

      if (typeof val === 'string') {
        const valTrim = val.toLowerCase().trim();
        return (userEmail && valTrim === userEmail) || (userUid && val === userUid);
      }
      if (val && typeof val === 'object') {
        const valEmail = (val.email || '').toLowerCase().trim();
        return (userEmail && valEmail === userEmail) || (userUid && val.uid === userUid);
      }
      return false;
    });
  }

  return false;
};

/**
 * Safely check if a user is the creator of a room.
 */
export const isRoomCreator = (room, user) => {
  if (!room?.creator || !user) return false;
  const userEmail = (user.email || '').toLowerCase().trim();
  const userUid = user.uid || '';
  const creatorEmail = (room.creator.email || '').toLowerCase().trim();
  const creatorUid = room.creator.uid || '';
  return (userEmail && creatorEmail === userEmail) || (userUid && creatorUid === userUid);
};