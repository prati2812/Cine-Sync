import React, { useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
  ActivityIndicator,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../theme/Colors';
import { getYoutubeVideoId, getYouTubeThumbnailDetails } from '../functions';

// In-memory LRU cache for link metadata
const previewCache = new Map();

/**
 * Utility: Extract first HTTP/HTTPS or www URL from message text
 */
export const extractFirstUrl = (text) => {
  if (!text || typeof text !== 'string') return null;
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/i;
  const match = text.match(urlRegex);
  if (!match) return null;
  let url = match[0].replace(/[.,!?;:()]+$/, '');
  if (url.toLowerCase().startsWith('www.')) {
    url = 'https://' + url;
  }
  return url;
};

/**
 * Utility: Extract clean domain hostname from URL
 */
const getHostname = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    const match = url.match(/:\/\/(www\.)?([^/?#]+)/i);
    return match ? match[2] : 'link';
  }
};

/**
 * Utility: Decode HTML entities from scraped meta tags
 */
const decodeHtmlEntities = (str) => {
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
 * Utility: Follow 301/302 redirects to obtain final canonical image URL
 * (Fixes React Native Android Fresco failing on cross-domain redirects)
 */
const resolveFinalImageUrl = async (imgUrl, signal) => {
  if (!imgUrl || typeof imgUrl !== 'string' || !imgUrl.startsWith('http')) {
    return imgUrl;
  }
  try {
    const res = await fetch(imgUrl, {
      method: 'HEAD',
      signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      },
    });
    if (res.ok && res.url) {
      return res.url;
    }
  } catch {
    // If HEAD fails, keep original image URL
  }
  return imgUrl;
};

/**
 * LinkPreviewCard Component
 * Generates seamless visual preview for YouTube videos & general web links.
 * Designed to integrate flush inside the chat tile without inner nested borders.
 */
const LinkPreviewCard = ({ url, navigation, isMyMessage, onLongPress }) => {
  const [metadata, setMetadata] = useState(() => previewCache.get(url) || null);
  const [loading, setLoading] = useState(!previewCache.has(url));
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!url) return;

    if (previewCache.has(url)) {
      setMetadata(previewCache.get(url));
      setLoading(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const resolveMetadata = async () => {
      const hostname = getHostname(url);
      const isYouTube =
        hostname.includes('youtube.com') || hostname.includes('youtu.be');
      const videoId = isYouTube ? getYoutubeVideoId(url) : null;

      // Fast-path: YouTube Video URL
      if (isYouTube && videoId) {
        const thumbDetails = getYouTubeThumbnailDetails(url);
        const thumbUrl =
          thumbDetails?.mqUrl ||
          thumbDetails?.maxresUrl ||
          `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

        let videoTitle = 'YouTube Video';
        let channelName = 'YouTube';

        try {
          const oEmbedRes = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(
              url
            )}&format=json`,
            { signal: controller.signal }
          );
          if (oEmbedRes.ok) {
            const data = await oEmbedRes.json();
            if (data.title) videoTitle = decodeHtmlEntities(data.title);
            if (data.author_name) channelName = decodeHtmlEntities(data.author_name);
          }
        } catch {
          // Fallback to default
        }

        const ytMeta = {
          url,
          domain: 'youtube.com',
          title: videoTitle,
          description: channelName,
          image: thumbUrl,
          isYouTube: true,
          videoId,
        };

        previewCache.set(url, ytMeta);
        if (isMounted) {
          setMetadata(ytMeta);
          setLoading(false);
        }
        return;
      }

      // General Web URL OpenGraph Resolver
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        let title = '';
        let description = '';
        let image = '';

        if (response.ok) {
          const html = await response.text();

          // Regex matching OpenGraph and title tags
          const ogTitle =
            html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ||
            html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:title["']/i)?.[1] ||
            html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];

          const ogImage =
            html.match(/<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url|:url)?["']/i)?.[1] ||
            html.match(/<meta[^>]+name=["'](?:twitter:image|twitter:image:src|thumbnail)["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["'](?:twitter:image|twitter:image:src|thumbnail)["']/i)?.[1] ||
            html.match(/<link[^>]+rel=["'](?:image_src|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i)?.[1];

          const ogDesc =
            html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1] ||
            html.match(/<meta[^>]+name=["'](?:twitter:description|description)["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["'](?:twitter:description|description)["']/i)?.[1];

          if (ogTitle) title = decodeHtmlEntities(ogTitle.trim());
          if (ogDesc) description = decodeHtmlEntities(ogDesc.trim());
          if (ogImage) {
            let candidate = ogImage.trim();
            if (candidate.startsWith('//')) {
              candidate = 'https:' + candidate;
            } else if (candidate.startsWith('/')) {
              try {
                const base = new URL(url);
                candidate = `${base.protocol}//${base.host}${candidate}`;
              } catch {
                candidate = '';
              }
            }
            if (candidate.startsWith('http')) {
              // Resolve any 301/302 redirect so Fresco on Android gets the direct image
              image = await resolveFinalImageUrl(candidate, controller.signal);
            }
          }
        }

        const favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

        const generalMeta = {
          url,
          domain: hostname,
          title: title || hostname,
          description: description || '',
          image: image || null,
          favicon,
          isYouTube: false,
        };

        previewCache.set(url, generalMeta);
        if (isMounted) {
          setMetadata(generalMeta);
          setLoading(false);
        }
      } catch {
        // Fallback for blocked or unreachable hosts
        const fallbackMeta = {
          url,
          domain: hostname,
          title: hostname,
          description: '',
          image: null,
          favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
          isYouTube: false,
        };
        previewCache.set(url, fallbackMeta);
        if (isMounted) {
          setMetadata(fallbackMeta);
          setLoading(false);
        }
      }
    };

    resolveMetadata();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [url]);

  const handleOpenUrl = async () => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.warn('Could not open URL:', err);
    }
  };

  const handleStreamTogether = () => {
    if (!navigation) return;
    navigation.navigate('CreateRoom', {
      prefilledStreamUrl: url,
      prefilledRoomName: metadata?.title || 'Live Screening',
    });
  };

  if (!url) return null;

  // Placeholder while fetching
  if (loading && !metadata) {
    const hostname = getHostname(url);
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.CYAN_ACCENT} />
        <Text style={styles.loadingText} numberOfLines={1}>
          Loading preview • {hostname}
        </Text>
      </View>
    );
  }

  if (!metadata) return null;

  const hasImage = Boolean(metadata.image) && !imageError;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.previewContainer}
      onPress={handleOpenUrl}
      onLongPress={onLongPress}
    >
      {/* Visual Thumbnail Banner with Bottom Fade Gradient */}
      {hasImage ? (
        <View style={styles.imageBannerWrap}>
          <Image
            source={{
              uri: metadata.image,
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
              },
            }}
            style={styles.imageBanner}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />

          {metadata.isYouTube && (
            <View style={styles.youtubePlayOverlay}>
              <View style={styles.youtubePlayCircle}>
                <Ionicons name="play" size={20} color="#FFF" style={{ marginLeft: 2 }} />
              </View>
            </View>
          )}

          {/* Bottom Gradient Overlay / Black Fade Gradient */}
          <LinearGradient
            colors={[
              'rgba(0, 0, 0, 0)',
              'rgba(8, 8, 16, 0.42)',
              'rgba(8, 8, 16, 0.88)',
              isMyMessage ? colors.PRIMARY_COLOR : colors.SURFACE_COLOR,
            ]}
            locations={[0, 0.4, 0.78, 1]}
            style={styles.bottomGradientOverlay}
          />

          {/* Floating Domain Pill at Top Left */}
          <View style={styles.domainFloatingPill}>
            {metadata.isYouTube ? (
              <Ionicons name="logo-youtube" size={13} color={colors.LIVE_RED} />
            ) : metadata.favicon ? (
              <Image source={{ uri: metadata.favicon }} style={styles.faviconMini} />
            ) : (
              <MaterialIcons name="public" size={12} color={colors.CYAN_ACCENT} />
            )}
            <Text style={styles.domainFloatingText} numberOfLines={1}>
              {metadata.domain}
            </Text>
          </View>
        </View>
      ) : (
        /* Compact Domain Header when no image */
        <View style={styles.compactDomainHeader}>
          {metadata.isYouTube ? (
            <Ionicons name="logo-youtube" size={15} color={colors.LIVE_RED} />
          ) : metadata.favicon ? (
            <Image source={{ uri: metadata.favicon }} style={styles.faviconMini} />
          ) : (
            <MaterialIcons name="public" size={14} color={colors.CYAN_ACCENT} />
          )}
          <Text style={styles.compactDomainText} numberOfLines={1}>
            {metadata.domain}
          </Text>
          <MaterialIcons
            name="open-in-new"
            size={13}
            color={isMyMessage ? 'rgba(255, 255, 255, 0.7)' : colors.SUB_TITLE_COLOR}
            style={{ marginLeft: 'auto' }}
          />
        </View>
      )}

      {/* Preview Info Body */}
      <View style={styles.bodyWrap}>
        <Text
          style={[styles.titleText, isMyMessage && { color: '#FFFFFF' }]}
          numberOfLines={2}
        >
          {metadata.title}
        </Text>

        {Boolean(metadata.description) && (
          <Text
            style={[
              styles.descText,
              isMyMessage && { color: 'rgba(255, 255, 255, 0.78)' },
            ]}
            numberOfLines={2}
          >
            {metadata.description}
          </Text>
        )}

        {/* Cine-Sync Watch Together Shortcut for Video links */}
        {metadata.isYouTube && navigation && (
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.streamTogetherBtn}
            onPress={handleStreamTogether}
          >
            <LinearGradient
              colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.streamTogetherGradient}
            >
              <MaterialIcons name="groups" size={15} color="#FFF" />
              <Text style={styles.streamTogetherText}>Host Watch Party</Text>
              <MaterialIcons name="chevron-right" size={15} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  previewContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  loadingText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '500',
  },
  imageBannerWrap: {
    width: '100%',
    height: 150,
    backgroundColor: colors.SURFACE_ELEVATED,
    position: 'relative',
    overflow: 'hidden',
  },
  imageBanner: {
    width: '100%',
    height: '100%',
  },
  bottomGradientOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
  },
  youtubePlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  youtubePlayCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239, 68, 68, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
    elevation: 5,
  },
  domainFloatingPill: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8, 8, 16, 0.82)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 5,
  },
  domainFloatingText: {
    color: colors.TITLE_COLOR,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  faviconMini: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  compactDomainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
    gap: 6,
  },
  compactDomainText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  bodyWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 4,
  },
  titleText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  descText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    lineHeight: 16,
  },
  streamTogetherBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 6,
  },
  streamTogetherGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 6,
  },
  streamTogetherText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
});

export default memo(LinkPreviewCard);
