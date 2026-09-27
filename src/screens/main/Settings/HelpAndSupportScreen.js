import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Linking,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import { auth } from '../../../config/firebase';
import { showCineAlert } from '../../../components/CineAlert';
import colors from '../../../theme/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FAQ_CATEGORIES = [
  { id: 'all', label: 'All', icon: 'stars' },
  { id: 'sync', label: 'Sync Engine', icon: 'sync' },
  { id: 'rooms', label: 'Rooms & Parties', icon: 'groups' },
  { id: 'video', label: 'Video Quality', icon: 'high-quality' },
  { id: 'account', label: 'Account & VIP', icon: 'shield-person' },
];

const FAQ_ITEMS = [
  {
    id: 1,
    category: 'rooms',
    question: 'How do I create a synchronized 4K lounge?',
    steps: [
      'Tap the Party Hub (+) on the bottom shelf to initialize Party Creator.',
      'Select your desired 4K HDR stream source and enable Spatial Crew Audio.',
      'Dispatch VIP pass links to your squad. All master playback commands automatically sync across peers with sub-50ms lock.',
    ],
  },
  {
    id: 2,
    category: 'sync',
    question: 'How do real-time audio sync & spatial chat work?',
    answer:
      'Cine-Sync isolates the cinema audio channel from party voice chatter. Voice packets utilize low-overhead WebRTC with directional acoustic dampening, so movie explosions dynamically duck when a friend speaks.',
  },
  {
    id: 3,
    category: 'sync',
    question: 'How to troubleshoot buffer lag or audio desync?',
    answer:
      "Quickly tap the 'Resync Pulse' icon on the top right of your video player. This flashes your peer connection and reconciles frames with the host room in less than 300ms without restarting the movie.",
  },
  {
    id: 4,
    category: 'video',
    question: 'What are the recommended speeds for 4K Dolby?',
    answer:
      'We recommend at least 25 Mbps stable downlink for 4K HDR10+ with Dolby Atmos passthrough, and 1.5 Mbps uplink to broadcast dual-mic spatial audio smoothly.',
  },
  {
    id: 5,
    category: 'rooms',
    question: 'How do I add friends to private screening lounges?',
    answer:
      "Navigate to the Friends tab, search for your friend's cinema tag or QR code, and send an invite. Once accepted, they can instantly drop into your hosted party with one tap.",
  },
  {
    id: 6,
    category: 'video',
    question: 'How can I improve stream quality?',
    answer:
      'To improve stream quality: ensure strong 5GHz Wi-Fi or wired connection, close unnecessary background apps, and adjust video quality settings inside the player controls.',
  },
  {
    id: 7,
    category: 'account',
    question: 'What benefits come with Cinema Gold Membership?',
    answer:
      'Cinema Gold members enjoy 4K HDR 60fps streaming, spatial room capacity up to 32 peers, custom cinema ambient lighting, and prioritized WebRTC sync nodes.',
  },
  {
    id: 8,
    category: 'account',
    question: 'How do I reset my App Security PIN?',
    answer:
      'Go to Settings > Vault & Security, toggle App PIN off to reset, or follow the security reset instructions with your account email.',
  },
];

function getMonogram(name, email) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'CS';
}

const HelpAndSupportScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;
  const safeBottomPadding = Math.max(insets.bottom, 16);

  const currentUser = auth().currentUser;
  const monogram = getMonogram(currentUser?.displayName, currentUser?.email);

  // States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedFaqId, setExpandedFaqId] = useState(1); // Default item 1 open
  const [faqFeedback, setFaqFeedback] = useState({});

  const handleToggleFaq = useCallback((id) => {
    setExpandedFaqId((prev) => (prev === id ? null : id));
  }, []);

  const handleFeedback = useCallback((id, helpful) => {
    setFaqFeedback((prev) => ({
      ...prev,
      [id]: helpful ? 'helpful' : 'unhelpful',
    }));
  }, []);

  const handleOpenUrl = useCallback(async (url, fallbackTitle) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        showCineAlert({
          type: 'action',
          icon: 'info',
          title: fallbackTitle || 'External Link',
          message: `Unable to open: ${url}`,
          confirmText: 'OK',
        });
      }
    } catch {
      showCineAlert({
        type: 'action',
        icon: 'info',
        title: fallbackTitle || 'External Link',
        message: `Opening ${url}`,
        confirmText: 'OK',
      });
    }
  }, []);

  const handleContactEmail = useCallback(() => {
    Linking.openURL('mailto:support@cinesync.app?subject=Cine-Sync Support Request');
  }, []);

  // Filtered FAQs
  const filteredFaqs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!query) return true;

      const inQuestion = item.question.toLowerCase().includes(query);
      const inAnswer = item.answer && item.answer.toLowerCase().includes(query);
      const inSteps =
        item.steps && item.steps.some((step) => step.toLowerCase().includes(query));
      return inQuestion || inAnswer || inSteps;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Atmospheric Ambient Glow Sheen */}
      <LinearGradient
        colors={['rgba(124, 58, 237, 0.22)', 'rgba(0, 122, 255, 0.08)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.ambientTopGlow}
        pointerEvents="none"
      />

      {/* ── 1. HEADER BAR ── */}
      <View style={[styles.headerBar, { paddingTop: safeTopPadding }]}>
        <View style={styles.headerLeftCol}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.75}
          >
            <MaterialIcons name="arrow-back" size={20} color={colors.TITLE_COLOR} />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitleText}>Help & Support</Text>
              <View style={styles.vipBadgePill}>
                <MaterialIcons name="support-agent" size={13} color={colors.FILM_GOLD} />
                <Text style={styles.vipBadgeText}>Cinema Gold</Text>
              </View>
            </View>
            <View style={styles.telemetryStatusRow}>
              <View style={styles.statusDotGreen} />
              <Text style={styles.telemetryStatusText}>All Systems Operational</Text>
            </View>
          </View>
        </View>

        {/* User Monogram Squircle Avatar */}
        <View style={styles.headerAvatarSquircle}>
          <Text style={styles.headerAvatarText}>{monogram}</Text>
        </View>
      </View>

      {/* ── MAIN SCROLLABLE CONTENT ── */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: safeBottomPadding + 86 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 2. SUB-HERO TITLE & TELEMETRY ── */}
        <View style={styles.heroSection}>
          <View style={styles.heroBadgeRow}>
            <View style={styles.conciergePill}>
              <Text style={styles.conciergePillText}>24/7 Concierge</Text>
            </View>
            <View style={styles.liveTelemetryWrap}>
              <View style={styles.telemetryDot} />
              <Text style={styles.liveTelemetryText}>Live Telemetry</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>How can we tune your cinema?</Text>
          <Text style={styles.heroSubText}>
            Instant solutions for sub-50ms synchronized watch parties, 4K HDR playback, and spatial crew lounges.
          </Text>
        </View>

        {/* ── 3. HERO SEARCH BAR ── */}
        <View style={styles.searchBarContainer}>
          <View style={styles.searchIconBox}>
            <MaterialIcons name="search" size={20} color={colors.CYAN_ACCENT} />
          </View>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search issues, room sync, playback..."
            placeholderTextColor="rgba(255, 255, 255, 0.40)"
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity
              style={styles.searchActionBtn}
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="close" size={18} color={colors.SUB_TITLE_COLOR} />
            </TouchableOpacity>
          ) : (
            <View style={styles.searchActionBtn}>
              <MaterialIcons name="mic-none" size={18} color={colors.MUTED_COLOR} />
            </View>
          )}
        </View>

        {/* ── 4. QUICK ACTION CARDS (2-Column Squircle Grid) ── */}
        <View style={styles.quickActionsGrid}>
          {/* Card A: Email Concierge */}
          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={handleContactEmail}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.actionIconBox,
                { backgroundColor: 'rgba(0, 122, 255, 0.16)' },
              ]}
            >
              <MaterialIcons name="mail" size={22} color={colors.PRIMARY_COLOR} />
            </View>
            <Text style={styles.actionCardTitle}>Email Concierge</Text>
            <Text style={styles.actionCardSub} numberOfLines={1}>
              Direct Developer Support
            </Text>
            <View style={styles.actionCardFooterRow}>
              <View style={[styles.microDot, { backgroundColor: colors.CYAN_ACCENT }]} />
              <Text style={[styles.actionCardFooterText, { color: colors.CYAN_ACCENT }]}>
                Avg reply: 2h
              </Text>
            </View>
          </TouchableOpacity>

          {/* Card B: Crew Lounge */}
          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => handleOpenUrl('https://discord.gg/cinesync', 'Crew Lounge')}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.actionIconBox,
                { backgroundColor: 'rgba(124, 58, 237, 0.16)' },
              ]}
            >
              <MaterialIcons name="forum" size={22} color={colors.PURPLE_ACCENT} />
            </View>
            <Text style={styles.actionCardTitle}>Crew Lounge</Text>
            <Text style={styles.actionCardSub} numberOfLines={1}>
              Join Official Discord
            </Text>
            <View style={styles.actionCardFooterRow}>
              <View style={[styles.microDot, { backgroundColor: colors.ACCEPT_GREEN }]} />
              <Text style={[styles.actionCardFooterText, { color: colors.ACCEPT_GREEN }]}>
                Active Party Hosts
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── 5. FAQ CATEGORY FILTER CHIPS ── */}
        <View style={styles.chipsSection}>
          <View style={styles.chipsHeaderRow}>
            <Text style={styles.chipsSectionTitle}>Popular Cinema Queries</Text>
            <Text style={styles.chipsSectionSubLink}>Knowledge Vault</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScrollContent}
          >
            {FAQ_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.chipBtn,
                    isSelected ? styles.chipBtnActive : styles.chipBtnInactive,
                  ]}
                  onPress={() => setSelectedCategory(cat.id)}
                  activeOpacity={0.75}
                >
                  <MaterialIcons
                    name={cat.icon}
                    size={15}
                    color={isSelected ? colors.PRIMARY_COLOR : colors.SUB_TITLE_COLOR}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      isSelected ? styles.chipTextActive : styles.chipTextInactive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── 6. EXPANDABLE FAQ ACCORDION ── */}
        <View style={styles.faqListContainer}>
          {filteredFaqs.length === 0 ? (
            <View style={styles.emptyFaqCard}>
              <MaterialIcons name="search-off" size={32} color={colors.MUTED_COLOR} />
              <Text style={styles.emptyFaqTitle}>No Matching Solutions Found</Text>
              <Text style={styles.emptyFaqSub}>
                Try adjusting your search terms or contact our 24/7 concierge below.
              </Text>
            </View>
          ) : (
            filteredFaqs.map((faq) => {
              const isExpanded = expandedFaqId === faq.id;
              const feedback = faqFeedback[faq.id];

              return (
                <View key={faq.id} style={styles.faqCard}>
                  <TouchableOpacity
                    style={styles.faqHeaderRow}
                    onPress={() => handleToggleFaq(faq.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.faqHeaderLeft}>
                      <View
                        style={[
                          styles.faqAccentBar,
                          isExpanded
                            ? { backgroundColor: colors.CYAN_ACCENT }
                            : { backgroundColor: colors.MUTED_COLOR },
                        ]}
                      />
                      <Text style={styles.faqQuestionText}>{faq.question}</Text>
                    </View>
                    <MaterialIcons
                      name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                      size={22}
                      color={isExpanded ? colors.CYAN_ACCENT : colors.SUB_TITLE_COLOR}
                    />
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.faqExpandedContent}>
                      {/* Step-by-step layout if steps exist */}
                      {faq.steps ? (
                        <View style={styles.stepsContainer}>
                          {faq.steps.map((step, idx) => (
                            <View key={idx} style={styles.stepRow}>
                              <View style={styles.stepBadge}>
                                <Text style={styles.stepBadgeText}>{idx + 1}</Text>
                              </View>
                              <Text style={styles.stepText}>{step}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.answerBox}>
                          <Text style={styles.answerText}>{faq.answer}</Text>
                        </View>
                      )}

                      {/* Helpful micro-feedback bar */}
                      <View style={styles.feedbackRow}>
                        {feedback ? (
                          <View style={styles.feedbackGivenRow}>
                            <MaterialIcons
                              name="check-circle"
                              size={15}
                              color={colors.ACCEPT_GREEN}
                            />
                            <Text style={styles.feedbackGivenText}>
                              Thanks for your feedback!
                            </Text>
                          </View>
                        ) : (
                          <>
                            <Text style={styles.feedbackPromptText}>Was this helpful?</Text>
                            <View style={styles.feedbackBtnRow}>
                              <TouchableOpacity
                                style={styles.feedbackBtn}
                                onPress={() => handleFeedback(faq.id, true)}
                                activeOpacity={0.7}
                              >
                                <MaterialIcons
                                  name="thumb-up"
                                  size={13}
                                  color={colors.SUB_TITLE_COLOR}
                                />
                                <Text style={styles.feedbackBtnText}>Yes</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.feedbackBtn}
                                onPress={() => handleFeedback(faq.id, false)}
                                activeOpacity={0.7}
                              >
                                <MaterialIcons
                                  name="thumb-down"
                                  size={13}
                                  color={colors.SUB_TITLE_COLOR}
                                />
                                <Text style={styles.feedbackBtnText}>No</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* ── 7. SYSTEM TELEMETRY LIVE CARD ── */}
        <View style={styles.telemetryCard}>
          <View style={styles.telemetryLeft}>
            <View style={styles.telemetryIconBox}>
              <MaterialIcons name="speed" size={20} color={colors.CYAN_ACCENT} />
            </View>
            <View style={styles.telemetryTextCol}>
              <Text style={styles.telemetryLabel}>Sync Telemetry</Text>
              <View style={styles.telemetryValueRow}>
                <View style={[styles.microDot, { backgroundColor: colors.CYAN_ACCENT }]} />
                <Text style={styles.telemetryValueText}>18ms • Ultra-Low Sync</Text>
              </View>
            </View>
          </View>
          <View style={styles.telemetryMeshBadge}>
            <View style={styles.statusDotGreen} />
            <Text style={styles.telemetryMeshText}>P2P Mesh Active</Text>
          </View>
        </View>

        {/* ── 8. APP CLIENT & LEGAL HUB ── */}
        <View style={styles.legalHubCard}>
          <View style={styles.legalRow}>
            <View style={styles.legalRowLeft}>
              <MaterialIcons name="check-circle" size={18} color={colors.ACCEPT_GREEN} />
              <Text style={styles.legalClientText}>Cine-Sync Client</Text>
            </View>
            <Text style={styles.legalVersionText}>v2.4 (Build 891)</Text>
          </View>

          <View style={styles.legalDivider} />

          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => handleOpenUrl('https://cinesync.app/terms', 'Terms of Service')}
            activeOpacity={0.7}
          >
            <View style={styles.legalRowLeft}>
              <MaterialIcons name="gavel" size={18} color={colors.SUB_TITLE_COLOR} />
              <Text style={styles.legalItemLabel}>Terms of Cinema Service</Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={18}
              color="rgba(255, 255, 255, 0.35)"
            />
          </TouchableOpacity>

          <View style={styles.legalDivider} />

          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => handleOpenUrl('https://cinesync.app/privacy', 'Privacy Policy')}
            activeOpacity={0.7}
          >
            <View style={styles.legalRowLeft}>
              <MaterialIcons name="security" size={18} color={colors.SUB_TITLE_COLOR} />
              <Text style={styles.legalItemLabel}>Privacy Vault & Peer Policy</Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={18}
              color="rgba(255, 255, 255, 0.35)"
            />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── 9. FLOATING HIGH-IMPACT CTA DOCK ── */}
      <View style={[styles.floatingDock, { paddingBottom: safeBottomPadding }]}>
        <TouchableOpacity
          style={styles.floatingCtaBtn}
          onPress={handleContactEmail}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.floatingGradientCore}
          >
            <MaterialIcons name="confirmation-number" size={19} color="#FFFFFF" />
            <Text style={styles.floatingCtaText}>Still stuck? Start a Ticket</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
//  Styles (Strict Cine-Sync Theme Tokens & Squircle Standards)
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    zIndex: 0,
  },

  // ── Header Bar ──
  headerBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    zIndex: 10,
  },
  headerLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    gap: 3,
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: -0.2,
  },
  vipBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 180, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.28)',
  },
  vipBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.FILM_GOLD,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  telemetryStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 2,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  telemetryStatusText: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },
  headerAvatarSquircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  // ── Scroll Content ──
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 18,
  },

  // ── 2. Hero Section ──
  heroSection: {
    gap: 8,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conciergePill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
  },
  conciergePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.CYAN_ACCENT,
    letterSpacing: 0.3,
  },
  liveTelemetryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  telemetryDot: {
    width: 6,
    height: 6,
    borderRadius: 2,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  liveTelemetryText: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.TITLE_COLOR,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  heroSubText: {
    fontSize: 13,
    color: colors.SUB_TITLE_COLOR,
    lineHeight: 19,
    fontWeight: '400',
  },

  // ── 3. Search Bar ──
  searchBarContainer: {
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  searchIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.SURFACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: colors.TITLE_COLOR,
    fontSize: 13.5,
    fontWeight: '500',
  },
  searchActionBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── 4. Quick Action Cards ──
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    padding: 13,
    gap: 4,
  },
  actionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  actionCardSub: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
  },
  actionCardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  microDot: {
    width: 5,
    height: 5,
    borderRadius: 1.5,
  },
  actionCardFooterText: {
    fontSize: 10.5,
    fontWeight: '700',
  },

  // ── 5. FAQ Chips ──
  chipsSection: {
    gap: 10,
  },
  chipsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  chipsSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  chipsSectionSubLink: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.CYAN_ACCENT,
  },
  chipsScrollContent: {
    gap: 8,
    paddingVertical: 2,
  },
  chipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipBtnActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.16)',
    borderColor: 'rgba(0, 122, 255, 0.40)',
  },
  chipBtnInactive: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderColor: colors.BORDER_SUBTLE,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.PRIMARY_COLOR,
  },
  chipTextInactive: {
    color: colors.SUB_TITLE_COLOR,
  },

  // ── 6. FAQ Accordion ──
  faqListContainer: {
    gap: 10,
  },
  faqCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    overflow: 'hidden',
  },
  faqHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 13,
    gap: 10,
  },
  faqHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  faqAccentBar: {
    width: 3.5,
    height: 18,
    borderRadius: 2,
  },
  faqQuestionText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
    flex: 1,
    lineHeight: 18,
  },
  faqExpandedContent: {
    paddingHorizontal: 14,
    paddingBottom: 13,
    paddingTop: 2,
    gap: 10,
  },
  stepsContainer: {
    padding: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 10,
    gap: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  stepBadge: {
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.CYAN_ACCENT,
  },
  stepText: {
    fontSize: 12.5,
    color: colors.TITLE_COLOR,
    lineHeight: 18,
    flex: 1,
  },
  answerBox: {
    padding: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 10,
  },
  answerText: {
    fontSize: 12.5,
    color: colors.TITLE_COLOR,
    lineHeight: 18,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  feedbackPromptText: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
  },
  feedbackBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  feedbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.SURFACE_ELEVATED,
  },
  feedbackBtnText: {
    fontSize: 11,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '600',
  },
  feedbackGivenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  feedbackGivenText: {
    fontSize: 11,
    color: colors.ACCEPT_GREEN,
    fontWeight: '600',
  },
  emptyFaqCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    gap: 8,
  },
  emptyFaqTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  emptyFaqSub: {
    fontSize: 12,
    color: colors.SUB_TITLE_COLOR,
    textAlign: 'center',
    lineHeight: 16,
  },

  // ── 7. Telemetry Card ──
  telemetryCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  telemetryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  telemetryIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  telemetryTextCol: {
    gap: 2,
  },
  telemetryLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },
  telemetryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  telemetryValueText: {
    fontSize: 11,
    color: colors.CYAN_ACCENT,
    fontWeight: '600',
  },
  telemetryMeshBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: 'rgba(0, 200, 83, 0.12)',
  },
  telemetryMeshText: {
    fontSize: 10.5,
    color: colors.ACCEPT_GREEN,
    fontWeight: '700',
  },

  // ── 8. Legal Hub ──
  legalHubCard: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    overflow: 'hidden',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  legalRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legalClientText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.TITLE_COLOR,
  },
  legalVersionText: {
    fontSize: 11.5,
    color: colors.SUB_TITLE_COLOR,
    fontWeight: '500',
  },
  legalItemLabel: {
    fontSize: 13,
    color: colors.TITLE_COLOR,
    fontWeight: '500',
  },
  legalDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginHorizontal: 14,
  },

  // ── 9. Floating Dock ──
  floatingDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'rgba(8, 8, 16, 0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  floatingCtaBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  floatingGradientCore: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  floatingCtaText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});

export default HelpAndSupportScreen;