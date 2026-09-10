/**
 * YouTube Thumbnail Utility for React Native
 * 
 * Extracts video IDs and generates thumbnail URLs with fallback support
 * for various YouTube URL schemes (watch, youtu.be, shorts, embed, live).
 */

export type YouTubeThumbnailQuality =
  | 'maxres'   // 1280x720 (maxresdefault.jpg) - Highest resolution
  | 'standard' // 640x480  (sddefault.jpg)
  | 'high'     // 480x360  (hqdefault.jpg)     - Reliable fallback, always generated
  | 'medium'   // 320x180  (mqdefault.jpg)
  | 'default'; // 120x90   (default.jpg)

export interface YouTubeThumbnailResult {
  /** Extracted 11-character YouTube video ID */
  videoId: string;
  /** Primary ultra-high resolution thumbnail URL (maxresdefault.jpg) */
  maxresUrl: string;
  /** High-quality fallback thumbnail URL (hqdefault.jpg) */
  hqUrl: string;
  /** Standard definition thumbnail URL (sddefault.jpg) */
  sdUrl: string;
  /** Medium resolution thumbnail URL (mqdefault.jpg) */
  mqUrl: string;
  /** Default smallest thumbnail URL (default.jpg) */
  defaultUrl: string;
  /** Primary thumbnail URL matching the requested or default quality */
  url: string;
  /** Always available fallback URL (hqdefault.jpg) */
  fallbackUrl: string;
}

export interface GetYouTubeThumbnailOptions {
  /**
   * Desired thumbnail quality. Defaults to 'maxres'.
   * If 'maxres' is unavailable on YouTube's CDN for lower resolution videos,
   * React Native's `<Image onError={...} />` can seamlessly fall back to `hqdefault.jpg`.
   */
  quality?: YouTubeThumbnailQuality;
  /**
   * Optional fallback quality. Defaults to 'high' (hqdefault.jpg).
   */
  fallbackQuality?: YouTubeThumbnailQuality;
}

/**
 * Quality filename mapping for YouTube thumbnail CDN endpoints.
 */
const QUALITY_FILES: Record<YouTubeThumbnailQuality, string> = {
  maxres: 'maxresdefault.jpg',
  standard: 'sddefault.jpg',
  high: 'hqdefault.jpg',
  medium: 'mqdefault.jpg',
  default: 'default.jpg',
};

/**
 * Regex matching YouTube video URLs:
 * - https://www.youtube.com/watch?v=VIDEO_ID (with any query params before/after v)
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/live/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 *
 * Ensures the 11-character video ID is bounded by query params (&, ?), hash (#), slash (/), whitespace, or end of string.
 */
const YOUTUBE_URL_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?(?:[^#\s]*&)?v=))([a-zA-Z0-9_-]{11})(?=[&?#/\s]|$)/;

/**
 * Extracts the 11-character YouTube video ID from a given URL.
 * Returns `null` for invalid, empty, or non-YouTube URLs.
 *
 * Supported Formats:
 * - `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
 * - `https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s`
 * - `https://www.youtube.com/watch?feature=shared&v=dQw4w9WgXcQ&si=123`
 * - `https://youtu.be/dQw4w9WgXcQ`
 * - `https://youtu.be/dQw4w9WgXcQ?si=abcdef123&t=45`
 * - `https://www.youtube.com/shorts/dQw4w9WgXcQ`
 * - `https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share`
 * - `https://www.youtube.com/embed/dQw4w9WgXcQ`
 * - `https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1`
 * - `https://www.youtube.com/live/dQw4w9WgXcQ`
 *
 * @param url Any YouTube video URL string
 * @returns 11-character video ID, or `null` if not found/invalid
 */
export function extractYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return null;
  }

  const match = trimmedUrl.match(YOUTUBE_URL_REGEX);
  return match && match[1] ? match[1] : null;
}

/**
 * Returns the primary YouTube thumbnail URL (`https://img.youtube.com/vi/{VIDEO_ID}/maxresdefault.jpg`)
 * for a given YouTube URL.
 *
 * @param url YouTube video URL
 * @param quality Optional quality ('maxres' | 'high' | 'standard' | 'medium' | 'default'). Default: 'maxres'
 * @returns Thumbnail URL string, or `null` if the input URL is invalid
 *
 * @example
 * ```typescript
 * const thumbnailUrl = getYouTubeThumbnail('https://youtu.be/dQw4w9WgXcQ');
 * // 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
 * ```
 */
export function getYouTubeThumbnail(
  url: string | null | undefined,
  quality: YouTubeThumbnailQuality = 'maxres'
): string | null {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return null;
  }

  const fileName = QUALITY_FILES[quality] || QUALITY_FILES.maxres;
  return `https://img.youtube.com/vi/${videoId}/${fileName}`;
}

/**
 * Returns comprehensive thumbnail endpoints and video details for a given YouTube URL,
 * including primary `maxresUrl` and guaranteed fallback `hqUrl`.
 *
 * @param url YouTube video URL
 * @param options Configuration options
 * @returns YouTubeThumbnailResult with all resolution URLs, or `null` if URL is invalid
 *
 * @example
 * ```typescript
 * const details = getYouTubeThumbnailDetails('https://www.youtube.com/shorts/dQw4w9WgXcQ');
 * if (details) {
 *   console.log(details.maxresUrl);  // 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
 *   console.log(details.fallbackUrl); // 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
 * }
 * ```
 */
export function getYouTubeThumbnailDetails(
  url: string | null | undefined,
  options: GetYouTubeThumbnailOptions = {}
): YouTubeThumbnailResult | null {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return null;
  }

  const requestedQuality = options.quality || 'maxres';
  const fallbackQuality = options.fallbackQuality || 'high';

  const baseUrl = `https://img.youtube.com/vi/${videoId}`;
  const maxresUrl = `${baseUrl}/${QUALITY_FILES.maxres}`;
  const hqUrl = `${baseUrl}/${QUALITY_FILES.high}`;
  const sdUrl = `${baseUrl}/${QUALITY_FILES.standard}`;
  const mqUrl = `${baseUrl}/${QUALITY_FILES.medium}`;
  const defaultUrl = `${baseUrl}/${QUALITY_FILES.default}`;

  return {
    videoId,
    maxresUrl,
    hqUrl,
    sdUrl,
    mqUrl,
    defaultUrl,
    url: `${baseUrl}/${QUALITY_FILES[requestedQuality] || QUALITY_FILES.maxres}`,
    fallbackUrl: `${baseUrl}/${QUALITY_FILES[fallbackQuality] || QUALITY_FILES.high}`,
  };
}

/**
 * Asynchronously verifies if `maxresdefault.jpg` is available on YouTube's CDN
 * using an HTTP HEAD request. If unavailable (HTTP 404), seamlessly falls back
 * to `hqdefault.jpg`.
 *
 * @param url YouTube video URL
 * @returns Verified thumbnail URL string, or `null` if invalid
 *
 * @example
 * ```typescript
 * const verifiedUrl = await getVerifiedYouTubeThumbnail(videoUrl);
 * ```
 */
export async function getVerifiedYouTubeThumbnail(
  url: string | null | undefined
): Promise<string | null> {
  const details = getYouTubeThumbnailDetails(url);
  if (!details) {
    return null;
  }

  try {
    const response = await fetch(details.maxresUrl, { method: 'HEAD' });
    if (response.ok && response.status === 200) {
      return details.maxresUrl;
    }
    return details.hqUrl;
  } catch (_error) {
    // If network check fails, return safe high-quality fallback
    return details.hqUrl;
  }
}
