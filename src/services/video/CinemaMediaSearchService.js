/**
 * CinemaMediaSearchService.js
 * High-performance, keyless media search engine for Cine-Sync.
 * Scrapes and parses public web media results directly on-device without
 * requiring Google Cloud API keys, quotas, or credit cards.
 *
 * Provides:
 * - searchCinemaMedia(query): Returns normalized video results
 * - fetchMediaSuggestions(query): Fast autocomplete suggestions
 * - parseYouTubeInitialData(html): Robust parser handling standard & hex payloads
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// In-memory cache for ultra-responsive repeated searches
const searchCache = new Map();
const suggestionsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Searches media catalog for videos matching the given query string.
 * @param {string} query - The search query (e.g. "Dune Part 2 trailer")
 * @returns {Promise<Array<{id: string, mediaUrl: string, title: string, channelName: string, duration: string, views: string, thumbnail: string, publishedTime: string}>>}
 */
export async function searchCinemaMedia(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  const cleanQuery = query.trim();
  const cacheKey = cleanQuery.toLowerCase();

  // 1. Check in-memory cache
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const results = parseYouTubeInitialData(html);

    // Save to cache if we got results
    if (results && results.length > 0) {
      searchCache.set(cacheKey, {
        timestamp: Date.now(),
        data: results,
      });
    }

    return results;
  } catch (error) {
    console.warn('[CinemaMediaSearchService] Search failed:', error?.message || error);
    // Return cached data if available even if expired, otherwise empty array
    if (cached && cached.data) {
      return cached.data;
    }
    return [];
  }
}

/**
 * Parses raw HTML response to extract video results from `ytInitialData`.
 * Handles both plain JSON objects and mobile hex-escaped formats.
 * @param {string} html - Raw HTML from youtube.com/results
 * @returns {Array} List of normalized video objects
 */
export function parseYouTubeInitialData(html) {
  if (!html || typeof html !== 'string') return [];

  let data = null;

  // 1. Try standard unescaped JSON: var ytInitialData = {...};</script>
  const jsonMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s) ||
                    html.match(/ytInitialData\s*=\s*({.+?});/);

  if (jsonMatch && jsonMatch[1]) {
    try {
      data = JSON.parse(jsonMatch[1]);
    } catch (e) {
      // Continue to hex fallback
    }
  }

  // 2. Try hex-escaped format (common in mobile web responses): var ytInitialData = '\x7b...';
  if (!data) {
    const hexMatch = html.match(/var ytInitialData = '(\\x[0-9A-Fa-f]{2}.*?)';/s);
    if (hexMatch && hexMatch[1]) {
      try {
        const unescaped = hexMatch[1].replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );
        data = JSON.parse(unescaped);
      } catch (e) {
        console.warn('[CinemaMediaSearchService] Failed to parse hex ytInitialData:', e);
      }
    }
  }

  if (!data) {
    return [];
  }

  const results = [];
  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
      ?.contents || [];

  for (const section of contents) {
    const itemSection = section?.itemSectionRenderer?.contents || [];
    for (const item of itemSection) {
      const v = item?.videoRenderer;
      if (v && v.videoId) {
        // Extract title
        const title =
          v.title?.runs?.map(r => r.text).join('') || v.title?.simpleText || '';

        // Extract channel / creator name
        const channelName =
          v.ownerText?.runs?.[0]?.text ||
          v.shortBylineText?.runs?.[0]?.text ||
          'Cinema Studio';

        // Extract duration & views
        const duration = v.lengthText?.simpleText || '';
        const views = v.viewCountText?.simpleText || v.shortViewCountText?.simpleText || '';
        const publishedTime = v.publishedTimeText?.simpleText || '';

        // Extract highest quality thumbnail
        const thumbs = v.thumbnail?.thumbnails || [];
        let thumbnail = '';
        if (thumbs.length > 0) {
          thumbnail = thumbs[thumbs.length - 1]?.url || '';
        }
        if (!thumbnail) {
          thumbnail = `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
        }

        results.push({
          id: v.videoId,
          mediaUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
          title: title.trim(),
          channelName: channelName.trim(),
          duration: duration.trim(),
          views: views.trim(),
          publishedTime: publishedTime.trim(),
          thumbnail,
        });
      }
    }
  }

  return results;
}

/**
 * Fetches live autocomplete search suggestions as the user types.
 * @param {string} query - The query prefix
 * @returns {Promise<string[]>} List of suggested query strings
 */
export async function fetchMediaSuggestions(query) {
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return [];
  }

  const cleanQuery = query.trim();
  const cacheKey = cleanQuery.toLowerCase();

  const cached = suggestionsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(
      cleanQuery
    )}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return [];

    const json = await res.json();
    const suggestions = Array.isArray(json?.[1]) ? json[1] : [];

    suggestionsCache.set(cacheKey, {
      timestamp: Date.now(),
      data: suggestions,
    });

    return suggestions;
  } catch (error) {
    return [];
  }
}

export default {
  searchCinemaMedia,
  fetchMediaSuggestions,
  parseYouTubeInitialData,
};
