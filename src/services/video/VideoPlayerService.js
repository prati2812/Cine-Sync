/**
 * VideoPlayerService
 * Universal video and stream URL analyzer & resolution service.
 * Supports YouTube, HLS (.m3u8), MPEG-DASH (.mpd), direct video files (.mp4, .webm, .mkv),
 * and custom media streaming endpoints.
 */

export const STREAM_TYPES = {
  YOUTUBE: 'YOUTUBE',
  HLS: 'HLS',
  DASH: 'DASH',
  DIRECT_VIDEO: 'DIRECT_VIDEO',
  CUSTOM: 'CUSTOM',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Extracts YouTube 11-character video ID if the given URL is a YouTube URL.
 * Supports:
 * - standard watch: youtube.com/watch?v=VIDEO_ID
 * - short link: youtu.be/VIDEO_ID
 * - embed: youtube.com/embed/VIDEO_ID
 * - shorts: youtube.com/shorts/VIDEO_ID
 * - mobile: m.youtube.com/watch?v=VIDEO_ID
 */
export function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const cleanUrl = url.trim();

  const patterns = [
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/,
    /^([\w-]{11})$/, // raw 11-char ID
  ];

  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Identifies the streaming format of any given URL.
 */
export function detectStreamType(url) {
  if (!url || typeof url !== 'string') return STREAM_TYPES.UNKNOWN;
  const clean = url.trim().toLowerCase();

  // 1. Check YouTube
  if (
    clean.includes('youtube.com') ||
    clean.includes('youtu.be') ||
    extractYouTubeId(url)
  ) {
    return STREAM_TYPES.YOUTUBE;
  }

  // 2. Check HLS (.m3u8)
  if (clean.includes('.m3u8') || clean.includes('/hls/') || clean.endsWith('/manifest.m3u8')) {
    return STREAM_TYPES.HLS;
  }

  // 3. Check MPEG-DASH (.mpd)
  if (clean.includes('.mpd') || clean.includes('/dash/')) {
    return STREAM_TYPES.DASH;
  }

  // 4. Check Direct Video Files
  const directExtensions = ['.mp4', '.m4v', '.webm', '.mkv', '.mov', '.ts', '.avi'];
  if (directExtensions.some(ext => clean.includes(ext))) {
    return STREAM_TYPES.DIRECT_VIDEO;
  }

  // 5. Generic HTTP/HTTPS stream
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return STREAM_TYPES.CUSTOM;
  }

  return STREAM_TYPES.UNKNOWN;
}

/**
 * Returns clean user-facing badges and stream info
 */
export function getStreamBadgeInfo(url) {
  const type = detectStreamType(url);
  switch (type) {
    case STREAM_TYPES.YOUTUBE:
      return { label: 'YouTube Stream', protocol: 'IFrame 4K', isAdaptive: true };
    case STREAM_TYPES.HLS:
      return { label: 'HLS Live Stream', protocol: 'm3u8 Adaptive', isAdaptive: true };
    case STREAM_TYPES.DASH:
      return { label: 'DASH Stream', protocol: 'MPEG-DASH', isAdaptive: true };
    case STREAM_TYPES.DIRECT_VIDEO:
      return { label: 'Direct Media', protocol: 'Direct MP4', isAdaptive: false };
    case STREAM_TYPES.CUSTOM:
    default:
      return { label: 'Live Media Stream', protocol: 'Universal', isAdaptive: true };
  }
}

export default {
  STREAM_TYPES,
  extractYouTubeId,
  detectStreamType,
  getStreamBadgeInfo,
};
