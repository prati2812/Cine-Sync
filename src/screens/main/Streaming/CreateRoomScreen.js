import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
  Animated,
  ActivityIndicator,
  Dimensions,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import Slider from '@react-native-community/slider';
import { auth, database } from '../../../config/firebase';
import colors from '../../../theme/Colors';
import {
  getYouTubeThumbnail,
  getYouTubeThumbnailDetails,
  fetchMediaMetadata,
} from '../../../functions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const QUICK_TIMES = [
  { hour: 18, minute: 0, label: '6:00 PM' },
  { hour: 19, minute: 0, label: '7:00 PM' },
  { hour: 20, minute: 0, label: '8:00 PM' },
  { hour: 20, minute: 30, label: '8:30 PM' },
  { hour: 21, minute: 0, label: '9:00 PM' },
  { hour: 21, minute: 30, label: '9:30 PM' },
  { hour: 22, minute: 0, label: '10:00 PM' },
  { hour: 23, minute: 0, label: '11:00 PM' },
];

// Clean titles with NO emojis as per workspace UI guidelines
const RANDOM_TITLES = [
  'Friday Night Sci-Fi Marathon',
  'Cosmic 4K Deep Screening',
  'Cyberpunk Anime Watch Party',
  'Retro Classics & Popcorn Night',
  'Neon Midnight Screening',
  'Champions League Live Match',
  'Anime Cinema Cozy Watch',
  'Synthwave Music Chillout',
  'Sci-Fi Mind Bender Screening',
  '4K IMAX Theater Party',
];

// Strictly vector icons - NO emojis in UI
const ATMOSPHERE_GENRES = [
  { icon: 'local-movies', label: 'Movies' },
  { icon: 'flash-on', label: 'Anime' },
  { icon: 'music-note', label: 'Music' },
  { icon: 'sports-soccer', label: 'Sports' },
  { icon: 'sports-esports', label: 'Gaming' },
  { icon: 'movie-filter', label: 'Documentary' },
];

const CreateRoomScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const editingRoom = route.params?.room;
  const isEditing = !!editingRoom;

  const loggedInUser = useSelector(state => state.user.user);

  // Dynamic notch protection padding
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;

  // Form states
  const [streamUrl, setStreamUrl] = useState(
    editingRoom?.streamUrl || 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
  );
  const [roomName, setRoomName] = useState(
    editingRoom?.name || 'Friday Night Sci-Fi Marathon'
  );
  const [selectedGenre, setSelectedGenre] = useState(
    ATMOSPHERE_GENRES.find(g => g.label === editingRoom?.genre) || ATMOSPHERE_GENRES[0]
  );
  const [screeningTier, setScreeningTier] = useState(
    editingRoom?.isVip ? 'vip' : 'standard'
  );
  const [isPrivate, setIsPrivate] = useState(
    editingRoom?.isPrivate !== undefined ? editingRoom.isPrivate : false
  );
  const [pin, setPin] = useState(editingRoom?.pin || '8429');
  const [capacity, setCapacity] = useState(editingRoom?.maxCapacity || 16);
  const [hostOnlyControl, setHostOnlyControl] = useState(
    editingRoom?.hostOnlyControl !== undefined ? editingRoom.hostOnlyControl : true
  );
  const [spatialVoice, setSpatialVoice] = useState(
    editingRoom?.spatialVoice !== undefined ? editingRoom.spatialVoice : true
  );
  const [floatingReactions, setFloatingReactions] = useState(
    editingRoom?.floatingReactions !== undefined ? editingRoom.floatingReactions : true
  );
  const [isCreating, setIsCreating] = useState(false);

  // Premiere Scheduling
  const [isScheduled, setIsScheduled] = useState(
    editingRoom?.isScheduled || !!editingRoom?.scheduledDate || false
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState(1); // Tomorrow default
  const [selectedTimeIndex, setSelectedTimeIndex] = useState(2); // 8:00 PM default

  // Email invitations
  const [inviteEmails, setInviteEmails] = useState(editingRoom?.participants || []);
  const [showEmailInvite, setShowEmailInvite] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');

  // Video Metadata & Title Auto-Detection
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
  const [autoFilledTitle, setAutoFilledTitle] = useState(null);

  // Connected Friends for Direct Member Invites
  const [friendsList, setFriendsList] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [isSearchingUser, setIsSearchingUser] = useState(false);

  // Live Thumbnail Details for Immediate Cinema Poster Preview
  const thumbDetails = useMemo(() => {
    if (!streamUrl || !streamUrl.trim()) return null;
    return getYouTubeThumbnailDetails(streamUrl.trim());
  }, [streamUrl]);

  const previewUri = thumbDetails?.maxresUrl || thumbDetails?.mqUrl || null;
  const isYouTube = streamUrl.toLowerCase().includes('youtube.com') || streamUrl.toLowerCase().includes('youtu.be');
  const isDirectMedia = streamUrl.toLowerCase().includes('.mp4') || streamUrl.toLowerCase().includes('.m3u8') || streamUrl.toLowerCase().includes('hls');

  // Auto-fetch video/media title whenever streamUrl changes (debounced by 450ms)
  useEffect(() => {
    const trimmed = streamUrl?.trim();
    if (!trimmed || trimmed.length < 8) {
      setIsFetchingMeta(false);
      return;
    }

    // Do not overwrite title if editing existing room on initial load
    if (isEditing && trimmed === editingRoom?.streamUrl) {
      return;
    }

    let isMounted = true;
    setIsFetchingMeta(true);

    const handler = setTimeout(async () => {
      try {
        const meta = await fetchMediaMetadata(trimmed);
        if (!isMounted) return;
        if (meta?.title) {
          setRoomName(meta.title);
          setAutoFilledTitle(meta.title);
        }
      } catch (err) {
        console.warn('Auto-detect stream metadata error:', err);
      } finally {
        if (isMounted) {
          setIsFetchingMeta(false);
        }
      }
    }, 450);

    return () => {
      isMounted = false;
      clearTimeout(handler);
    };
  }, [streamUrl, isEditing]);

  // Fetch connected friends for production-ready member invites
  useEffect(() => {
    const user = auth().currentUser;
    if (!user) {
      setLoadingFriends(false);
      return;
    }

    const db = database();
    const friendsRef = db.ref(`friends/${user.uid}`);

    const onFriendsValue = async snapshot => {
      const data = snapshot.val();
      if (!data) {
        setFriendsList([]);
        setLoadingFriends(false);
        return;
      }

      const friendIds = Object.keys(data);
      try {
        const userPromises = friendIds.map(id => db.ref(`users/${id}`).once('value'));
        const userSnaps = await Promise.all(userPromises);
        const list = [];
        userSnaps.forEach((s, idx) => {
          const val = s.val();
          if (val) {
            list.push({
              userId: friendIds[idx],
              username: val.username || val.displayName || 'Friend',
              email: (val.email || '').toLowerCase().trim(),
              profileImage: val.profileImage || val.photoURL || null,
              isOnline: val.status === 'online' || val.status?.state === 'online',
            });
          }
        });
        setFriendsList(list);
      } catch (err) {
        console.warn('Error loading connected friends:', err);
      } finally {
        setLoadingFriends(false);
      }
    };

    friendsRef.on('value', onFriendsValue);
    return () => friendsRef.off('value', onFriendsValue);
  }, []);

  const filteredFriends = useMemo(() => {
    if (!friendSearchQuery.trim()) return friendsList;
    const q = friendSearchQuery.trim().toLowerCase();
    return friendsList.filter(
      f =>
        f.username.toLowerCase().includes(q) ||
        f.email.toLowerCase().includes(q)
    );
  }, [friendsList, friendSearchQuery]);

  const upcomingDays = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      let label = '';
      if (i === 0) label = 'Today';
      else if (i === 1) label = 'Tomorrow';
      else {
        label = d.toLocaleDateString(undefined, { weekday: 'short' });
      }
      const sub = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      days.push({ label, sub, dateObj: d });
    }
    return days;
  }, []);

  const scheduledDateTime = useMemo(() => {
    const targetDay = upcomingDays[selectedDayIndex]?.dateObj || new Date();
    const time = QUICK_TIMES[selectedTimeIndex] || QUICK_TIMES[2];
    const d = new Date(targetDay);
    d.setHours(time.hour, time.minute, 0, 0);
    return d;
  }, [upcomingDays, selectedDayIndex, selectedTimeIndex]);

  const formatScheduledDate = d => {
    if (!d) return '';
    return (
      d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }) +
      ' at ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  };

  // Actions
  const handleRandomizeTitle = () => {
    const available = RANDOM_TITLES.filter(t => t !== roomName);
    const chosen = available[Math.floor(Math.random() * available.length)];
    setRoomName(chosen);
  };

  const handleRegeneratePin = () => {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    setPin(newPin);
  };

  const handlePasteUrl = async () => {
    try {
      let ClipboardModule = null;
      try {
        ClipboardModule = require('@react-native-clipboard/clipboard').default;
      } catch (err) {
        // Native module not registered in the currently running binary
      }

      if (ClipboardModule && typeof ClipboardModule.getString === 'function') {
        const text = await ClipboardModule.getString();
        if (text && text.trim().length > 0) {
          setStreamUrl(text.trim());
          return;
        } else {
          Alert.alert('Clipboard Empty', 'No text found in clipboard.');
          return;
        }
      }

      Alert.alert(
        'Paste Link',
        'Direct clipboard access requires rebuilding the app binary. You can paste your stream link directly into the input field.',
        [{ text: 'OK' }]
      );
    } catch (e) {
      console.warn('Clipboard paste error:', e);
      Alert.alert(
        'Paste Link',
        'You can paste your stream link directly into the input field.'
      );
    }
  };

  const handleClearUrl = () => {
    setStreamUrl('');
  };

  const handleSelectTier = tier => {
    setScreeningTier(tier);
    if (tier === 'vip') {
      setCapacity(prev => Math.max(prev, 30));
      setSpatialVoice(true);
      setHostOnlyControl(true);
    } else {
      setCapacity(prev => Math.min(prev, 16));
    }
  };

  const decrementCapacity = () => setCapacity(c => Math.max(2, c - 1));
  const incrementCapacity = () => setCapacity(c => Math.min(50, c + 1));

  const checkUserExists = async email => {
    try {
      const snapshot = await database()
        .ref('users')
        .orderByChild('email')
        .equalTo(email)
        .once('value');
      return snapshot.exists();
    } catch (error) {
      console.log('Database verify user error:', error);
      return false;
    }
  };

  const toggleFriendInvite = friend => {
    if (!friend.email) {
      Alert.alert(
        'No Email Available',
        `${friend.username} does not have an email address associated with their account.`
      );
      return;
    }
    const target = friend.email.toLowerCase().trim();
    if (inviteEmails.map(e => e.toLowerCase()).includes(target)) {
      setInviteEmails(prev => prev.filter(e => e.toLowerCase() !== target));
    } else {
      setInviteEmails(prev => [...prev, target]);
    }
  };

  const addEmail = async () => {
    if (!currentEmail.trim()) return;
    const raw = currentEmail.trim();
    let target = raw.toLowerCase();

    setIsSearchingUser(true);

    try {
      // Support inviting by @username or raw username
      if (!target.includes('@') || target.startsWith('@')) {
        const cleanUsername = target.replace(/^@/, '');
        const snapshot = await database()
          .ref('users')
          .orderByChild('username')
          .equalTo(cleanUsername)
          .once('value');
        const val = snapshot.val();
        if (val) {
          const found = Object.values(val)[0];
          if (found?.email) {
            target = found.email.toLowerCase().trim();
          } else {
            Alert.alert('User Error', 'This user does not have a registered email.');
            return;
          }
        } else {
          Alert.alert('User Not Found', `No registered user found with username "${cleanUsername}".`);
          return;
        }
      }

      if (inviteEmails.map(e => e.toLowerCase()).includes(target)) {
        Alert.alert('Duplicate Invitation', 'This user is already added to the invite list.');
        return;
      }

      if (target === auth().currentUser?.email?.toLowerCase()) {
        Alert.alert('Invalid Invitation', 'You cannot invite yourself.');
        return;
      }

      const userExists = await checkUserExists(target);
      if (userExists) {
        setInviteEmails(prev => [...prev, target]);
        setCurrentEmail('');
      } else {
        Alert.alert(
          'User Not Found',
          'This email is not registered in Cine-Sync. Only registered users can be invited.',
          [{ text: 'OK', onPress: () => setCurrentEmail('') }]
        );
      }
    } catch (error) {
      console.error('Error adding invite:', error);
      Alert.alert('Error', 'Failed to verify user. Please try again.');
    } finally {
      setIsSearchingUser(false);
    }
  };

  const removeEmail = emailToRemove => {
    setInviteEmails(inviteEmails.filter(e => e !== emailToRemove));
  };

  const createRoom = async () => {
    if (!roomName.trim() || !streamUrl.trim()) {
      Alert.alert('Required Fields', 'Please enter a Screening Title and Stream Link.');
      return;
    }

    const db = database();
    const user = auth().currentUser;

    if (!user) {
      Alert.alert('Authentication Error', 'You must be logged in to create a room');
      return;
    }

    setIsCreating(true);

    try {
      const roomId = isEditing ? editingRoom.roomId : `room_${Date.now()}`;
      const roomRef = db.ref(`rooms/${roomId}`);

      const roomData = {
        roomId: roomId,
        name: roomName.trim(),
        nameLower: roomName.trim().toLowerCase(),
        creator: isEditing
          ? editingRoom.creator
          : {
              uid: user.uid,
              email: user.email,
              userName: loggedInUser?.username || 'Host',
            },
        streamUrl: streamUrl.trim(),
        participants: [...inviteEmails],
        thumbnail:
          previewUri ||
          getYouTubeThumbnail(streamUrl.trim()) ||
          null,
        genre: selectedGenre.label || 'Movies',
        isPrivate: isPrivate,
        pin: isPrivate ? pin : null,
        isVip: screeningTier === 'vip',
        maxCapacity: capacity,
        hostOnlyControl: hostOnlyControl,
        spatialVoice: spatialVoice,
        floatingReactions: floatingReactions,
        isScheduled: isScheduled,
        scheduledDate: isScheduled ? scheduledDateTime.toISOString() : null,
        createdAt: isEditing ? editingRoom.createdAt : new Date().toISOString(),
        status: isScheduled ? 'scheduled' : 'active',
      };

      // Atomic multi-path write for 20M / 5M DAU scale:
      // Writes both full room and lightweight user_rooms pointer simultaneously
      const updates = {};
      updates[`rooms/${roomId}`] = roomData;
      updates[`user_rooms/${user.uid}/${roomId}`] = {
        roomId,
        name: roomData.name,
        nameLower: roomData.nameLower,
        role: 'creator',
        createdAt: roomData.createdAt,
        status: roomData.status,
        isVip: roomData.isVip,
        thumbnail: roomData.thumbnail,
      };

      await db.ref().update(updates);

      navigation.replace('WaitingScreen', {
        roomId: roomId,
        roomName: roomName.trim(),
        streamUrl: streamUrl.trim(),
        thumbnail: roomData.thumbnail,
        isScheduled: isScheduled,
        scheduledDate: isScheduled ? scheduledDateTime.toISOString() : null,
      });
    } catch (error) {
      console.error('Error saving room:', error);
      Alert.alert(
        'Error',
        `Failed to ${isEditing ? 'update' : 'create'} screening room. Please try again.`
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={styles.screenWrap}>
      <StatusBar
        backgroundColor={colors.BACKGROUND_COLOR}
        barStyle="light-content"
        translucent
      />

      {/* Ambient Top Glow Overlay - matching Login/SignUp/Home */}
      <View style={styles.ambientTopGlow} pointerEvents="none">
        <LinearGradient
          colors={['rgba(124, 58, 237, 0.22)', 'rgba(0, 122, 255, 0.1)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* ── UNIFIED TOP HEADER BAR (Single Bar, Notch Protected) ── */}
      <View style={[styles.topHeaderBar, { paddingTop: safeTopPadding }]}>
        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back-ios-new" size={20} color={colors.TITLE_COLOR} />
        </TouchableOpacity>

        <Text style={styles.headerTitleText} numberOfLines={1}>
          {isEditing ? 'Edit Screening' : 'Host a Screening'}
        </Text>

        <TouchableOpacity
          style={styles.headerVipPill}
          onPress={() => handleSelectTier(screeningTier === 'vip' ? 'standard' : 'vip')}
          activeOpacity={0.8}
        >
          <MaterialIcons
            name="workspace-premium"
            size={16}
            color={screeningTier === 'vip' ? colors.FILM_GOLD : colors.SUB_TITLE_COLOR}
          />
          <Text
            style={[
              styles.headerVipText,
              screeningTier === 'vip' && styles.headerVipTextActive,
            ]}
          >
            {screeningTier === 'vip' ? 'VIP Lounge' : 'Standard'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── SECTION 1: MEDIA SOURCE URL & LIVE POSTER PREVIEW ── */}
          <View style={styles.formSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <MaterialIcons name="link" size={16} color={colors.CYAN_ACCENT} />
                <Text style={styles.sectionLabelText}>MEDIA STREAM SOURCE</Text>
              </View>
              <View style={styles.instantSyncBadge}>
                <MaterialIcons name="verified" size={13} color={colors.CYAN_ACCENT} />
                <Text style={styles.instantSyncText}>Live Parity Sync</Text>
              </View>
            </View>

            {/* Clean Capsule URL Input */}
            <View style={styles.urlInputCapsule}>
              <View style={styles.urlInputIconWrap}>
                <MaterialIcons name="smart-display" size={20} color={colors.CYAN_ACCENT} />
              </View>
              <TextInput
                style={styles.urlTextInput}
                placeholder="Paste YouTube, MP4, or HLS stream link..."
                placeholderTextColor={colors.MUTED_COLOR}
                value={streamUrl}
                onChangeText={setStreamUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.urlActionRow}>
                {streamUrl.length > 0 && (
                  <TouchableOpacity
                    style={styles.urlClearBtn}
                    onPress={handleClearUrl}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="cancel" size={18} color={colors.SUB_TITLE_COLOR} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.urlPasteBtn}
                  onPress={handlePasteUrl}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="content-paste" size={13} color={colors.CYAN_ACCENT} />
                  <Text style={styles.urlPasteText}>Paste</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── LIVE CINEMA POSTER PREVIEW CARD ── */}
            <View style={styles.posterPreviewWrap}>
              {previewUri ? (
                <View style={styles.posterCard}>
                  <Image
                    source={{ uri: previewUri }}
                    style={styles.posterImage}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['rgba(8, 8, 16, 0.2)', 'rgba(8, 8, 16, 0.92)']}
                    style={styles.posterGradient}
                  >
                    <View style={styles.posterTopBadgeRow}>
                      <View style={styles.posterReadyBadge}>
                        <View style={styles.posterReadyDot} />
                        <Text style={styles.posterReadyText}>SYNC READY</Text>
                      </View>
                      <View style={styles.posterSourceBadge}>
                        <MaterialIcons
                          name={isYouTube ? 'play-circle' : isDirectMedia ? 'code' : 'live-tv'}
                          size={12}
                          color="#FFF"
                        />
                        <Text style={styles.posterSourceText}>
                          {isYouTube ? 'YouTube HD' : isDirectMedia ? 'Direct Stream' : 'Web Stream'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.posterInfoBottom}>
                      <Text style={styles.posterTitleText} numberOfLines={1}>
                        {roomName || 'Untitled Screening'}
                      </Text>
                      <Text style={styles.posterGenreTag}>
                        Genre: {selectedGenre.label}
                      </Text>
                    </View>
                  </LinearGradient>
                </View>
              ) : (
                <View style={styles.posterPlaceholderBox}>
                  <View style={styles.placeholderIconCircle}>
                    <MaterialIcons name="theaters" size={26} color={colors.CYAN_ACCENT} />
                  </View>
                  <Text style={styles.placeholderTitle}>Cinema Stream Preview</Text>
                  <Text style={styles.placeholderSubtitle}>
                    Enter a YouTube or direct video link above to load the live screening poster.
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── SECTION 2: SCREENING TITLE & ATMOSPHERE GENRE ── */}
          <View style={styles.formSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <MaterialIcons name="drive-file-rename-outline" size={16} color={colors.PRIMARY_COLOR} />
                <Text style={styles.sectionLabelText}>SCREENING TITLE</Text>
              </View>
              <Text style={styles.charCounterText}>{roomName.length} / 50</Text>
            </View>

            {/* Title Input with Randomize Vector Icon Button (No Emoji) */}
            <View style={styles.roomNameCapsule}>
              <TextInput
                style={styles.roomNameInput}
                placeholder="Give your screening a name..."
                placeholderTextColor={colors.MUTED_COLOR}
                value={roomName}
                onChangeText={text => {
                  setRoomName(text);
                  if (autoFilledTitle && text !== autoFilledTitle) {
                    setAutoFilledTitle(null);
                  }
                }}
                maxLength={50}
              />
              <TouchableOpacity
                style={styles.randomizeBtn}
                onPress={handleRandomizeTitle}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="shuffle" size={20} color={colors.PRIMARY_COLOR} />
              </TouchableOpacity>
            </View>

            {/* Auto-detected Stream Title Badge */}
            {isFetchingMeta && (
              <View style={styles.autoFetchStatusRow}>
                <ActivityIndicator size="small" color={colors.CYAN_ACCENT} />
                <Text style={styles.autoFetchStatusText}>Auto-detecting title from stream link...</Text>
              </View>
            )}
            {!isFetchingMeta && autoFilledTitle && autoFilledTitle === roomName && (
              <View style={styles.autoFilledBadge}>
                <MaterialIcons name="auto-awesome" size={13} color={colors.CYAN_ACCENT} />
                <Text style={styles.autoFilledBadgeText}>Title Auto-Filled from Stream</Text>
              </View>
            )}

            {/* Atmosphere Genre Vector Icon Chips */}
            <View style={styles.genreCarouselWrap}>
              <View style={styles.genreLabelRow}>
                <MaterialIcons name="category" size={14} color={colors.SUB_TITLE_COLOR} />
                <Text style={styles.genreCarouselLabel}>SELECT GENRE</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.genreScrollTrack}
              >
                {ATMOSPHERE_GENRES.map(genre => {
                  const isSelected = selectedGenre.label === genre.label;
                  return (
                    <TouchableOpacity
                      key={genre.label}
                      style={[styles.genrePill, isSelected && styles.genrePillSelected]}
                      onPress={() => setSelectedGenre(genre)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons
                        name={genre.icon}
                        size={16}
                        color={isSelected ? colors.TITLE_COLOR : colors.CYAN_ACCENT}
                      />
                      <Text style={[styles.genreLabelText, isSelected && styles.genreLabelTextSelected]}>
                        {genre.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* ── SECTION 3: SCREENING TIER (Monetization & VIP Service) ── */}
          <View style={styles.cardContainer}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardHeaderIconWrap, { backgroundColor: 'rgba(255, 180, 0, 0.12)' }]}>
                <MaterialIcons name="workspace-premium" size={18} color={colors.FILM_GOLD} />
              </View>
              <View style={styles.cardHeaderTextCol}>
                <Text style={styles.cardHeaderTitle}>Screening Tier & Service</Text>
                <Text style={styles.cardHeaderSubtitle}>Select theater experience & audience scale</Text>
              </View>
            </View>

            <View style={styles.tierSelectorRow}>
              {/* Standard Screening Tier */}
              <TouchableOpacity
                style={[
                  styles.tierOptionCard,
                  screeningTier === 'standard' && styles.tierOptionCardActive,
                ]}
                onPress={() => handleSelectTier('standard')}
                activeOpacity={0.85}
              >
                <View style={styles.tierTopRow}>
                  <MaterialIcons
                    name="theaters"
                    size={20}
                    color={screeningTier === 'standard' ? colors.PRIMARY_COLOR : colors.SUB_TITLE_COLOR}
                  />
                  <Text style={styles.tierBadgeFree}>STANDARD</Text>
                </View>
                <Text style={styles.tierTitle}>Public Lounge</Text>
                <Text style={styles.tierPerkText}>• Up to 16 viewers</Text>
                <Text style={styles.tierPerkText}>• Full HD 1080p sync</Text>
              </TouchableOpacity>

              {/* VIP Premiere Lounge Tier (Monetization) */}
              <TouchableOpacity
                style={[
                  styles.tierOptionCard,
                  styles.tierOptionCardVip,
                  screeningTier === 'vip' && styles.tierOptionCardVipActive,
                ]}
                onPress={() => handleSelectTier('vip')}
                activeOpacity={0.85}
              >
                <View style={styles.tierTopRow}>
                  <MaterialIcons
                    name="military-tech"
                    size={22}
                    color={colors.FILM_GOLD}
                  />
                  <Text style={styles.tierBadgeVip}>VIP PRO</Text>
                </View>
                <Text style={styles.tierTitleVip}>VIP Cinema Suite</Text>
                <Text style={styles.tierPerkText}>• Up to 50 viewers</Text>
                <Text style={styles.tierPerkText}>• Spatial Audio 3D & 4K</Text>
                <Text style={styles.tierPerkText}>• Director Lock Mode</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── SECTION 4: ACCESS & SECURITY (Public vs Private Passcode) ── */}
          <View style={styles.cardContainer}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderIconWrap}>
                <MaterialIcons name="security" size={18} color={colors.PRIMARY_COLOR} />
              </View>
              <View style={styles.cardHeaderTextCol}>
                <Text style={styles.cardHeaderTitle}>Access & Privacy</Text>
                <Text style={styles.cardHeaderSubtitle}>Control who can join your screening room</Text>
              </View>
            </View>

            {/* Segmented Switch: Public Lounge vs Private Theater */}
            <View style={styles.accessSegmentTrack}>
              <TouchableOpacity
                style={[styles.accessSegmentBtn, !isPrivate && styles.accessSegmentBtnActive]}
                onPress={() => setIsPrivate(false)}
                activeOpacity={0.85}
              >
                <MaterialIcons
                  name="public"
                  size={16}
                  color={!isPrivate ? colors.TITLE_COLOR : colors.SUB_TITLE_COLOR}
                />
                <Text style={[styles.accessSegmentText, !isPrivate && styles.accessSegmentTextActive]}>
                  Public Lounge
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.accessSegmentBtn, isPrivate && styles.accessSegmentBtnActive]}
                onPress={() => setIsPrivate(true)}
                activeOpacity={0.85}
              >
                <MaterialIcons
                  name="lock"
                  size={16}
                  color={isPrivate ? colors.TITLE_COLOR : colors.SUB_TITLE_COLOR}
                />
                <Text style={[styles.accessSegmentText, isPrivate && styles.accessSegmentTextActive]}>
                  Private (PIN Gate)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Compact PIN Generator (When Private) */}
            {isPrivate && (
              <View style={styles.pinSectionWrap}>
                <View style={styles.pinHeaderRow}>
                  <Text style={styles.pinSectionLabel}>ROOM ENTRANCE PASSCODE</Text>
                  <TouchableOpacity
                    style={styles.pinRegenerateBtn}
                    onPress={handleRegeneratePin}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="autorenew" size={15} color={colors.CYAN_ACCENT} />
                    <Text style={styles.pinRegenerateText}>Shuffle</Text>
                  </TouchableOpacity>
                </View>

                {/* 4-Digit Squircle PIN Row */}
                <View style={styles.pinDigitsRow}>
                  {pin.slice(0, 4).padEnd(4, '0').split('').map((digit, idx) => (
                    <View key={idx} style={styles.pinDigitBox}>
                      <Text style={styles.pinDigitText}>{digit}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Max Capacity Stepper & Slider */}
            <View style={styles.capacitySection}>
              <View style={styles.capacityHeaderRow}>
                <View>
                  <Text style={styles.capacityTitle}>Audience Capacity</Text>
                  <Text style={styles.capacitySubtitle}>
                    {screeningTier === 'vip' ? 'VIP suite accommodates up to 50 viewers' : 'Standard lounge recommends 10–16 viewers'}
                  </Text>
                </View>

                {/* Numeric Stepper */}
                <View style={styles.stepperContainer}>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={decrementCapacity}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="remove" size={18} color={colors.TITLE_COLOR} />
                  </TouchableOpacity>
                  <Text style={styles.stepperValueText}>{capacity}</Text>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={incrementCapacity}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="add" size={18} color={colors.TITLE_COLOR} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Slider Track */}
              <View style={styles.sliderContainer}>
                <Slider
                  style={styles.sliderComponent}
                  minimumValue={2}
                  maximumValue={50}
                  step={1}
                  value={capacity}
                  onValueChange={v => setCapacity(Math.round(v))}
                  minimumTrackTintColor={colors.PRIMARY_COLOR}
                  maximumTrackTintColor={colors.SURFACE_ELEVATED}
                  thumbTintColor={colors.TITLE_COLOR}
                />
                <View style={styles.sliderLabelsRow}>
                  <Text style={styles.sliderMinLabel}>2 Seats</Text>
                  <Text style={styles.sliderMaxLabel}>50 Seats (VIP)</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── SECTION 5: CINEMA DIRECTOR & SOUND PERKS ── */}
          <View style={styles.cardContainer}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardHeaderIconWrap, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
                <MaterialIcons name="tune" size={18} color={colors.CYAN_ACCENT} />
              </View>
              <View style={styles.cardHeaderTextCol}>
                <Text style={styles.cardHeaderTitle}>Cinema Audio & Director Perks</Text>
                <Text style={styles.cardHeaderSubtitle}>Playback authority and acoustics</Text>
              </View>
            </View>

            {/* Toggle 1: Director Mode (Host-Only Playback) */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <View style={styles.ruleTitleWithIcon}>
                  <MaterialIcons name="verified-user" size={16} color={colors.CYAN_ACCENT} />
                  <Text style={styles.toggleTitle}>Director Mode (Host Lock)</Text>
                </View>
                <Text style={styles.toggleSubtitle}>Only host can play, pause, seek, and shift resolution</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.switchTrack, hostOnlyControl ? styles.switchTrackActiveCyan : styles.switchTrackInactive]}
                onPress={() => setHostOnlyControl(!hostOnlyControl)}
              >
                <View style={[styles.switchThumb, hostOnlyControl && styles.switchThumbActive]} />
              </TouchableOpacity>
            </View>

            {/* Toggle 2: Spatial Voice Audio */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <View style={styles.ruleTitleWithIcon}>
                  <MaterialIcons name="headset" size={16} color={colors.PRIMARY_COLOR} />
                  <Text style={styles.toggleTitle}>Spatial Audio 3D</Text>
                </View>
                <Text style={styles.toggleSubtitle}>Low-latency cinema acoustic channel with echo cancellation</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.switchTrack, spatialVoice ? styles.switchTrackActivePurple : styles.switchTrackInactive]}
                onPress={() => setSpatialVoice(!spatialVoice)}
              >
                <View style={[styles.switchThumb, spatialVoice && styles.switchThumbActive]} />
              </TouchableOpacity>
            </View>

            {/* Toggle 3: Live Cinema Reactions */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <View style={styles.ruleTitleWithIcon}>
                  <MaterialIcons name="celebration" size={16} color={colors.FILM_GOLD} />
                  <Text style={styles.toggleTitle}>Live Cinema Reactions</Text>
                </View>
                <Text style={styles.toggleSubtitle}>Floating audience cheers, applause, and popcorn effects</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.switchTrack, floatingReactions ? styles.switchTrackActivePurple : styles.switchTrackInactive]}
                onPress={() => setFloatingReactions(!floatingReactions)}
              >
                <View style={[styles.switchThumb, floatingReactions && styles.switchThumbActive]} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── SECTION 6: PREMIERE SCHEDULER (Collapsible) ── */}
          <View style={styles.cardContainer}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardHeaderIconWrap, { backgroundColor: 'rgba(255, 180, 0, 0.12)' }]}>
                <MaterialIcons name="event" size={18} color={colors.FILM_GOLD} />
              </View>
              <View style={styles.cardHeaderTextCol}>
                <Text style={styles.cardHeaderTitle}>Schedule Premiere Event</Text>
                <Text style={styles.cardHeaderSubtitle}>Set future date & time for countdown launch</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.switchTrack, isScheduled ? styles.switchTrackActiveGold : styles.switchTrackInactive]}
                onPress={() => setIsScheduled(!isScheduled)}
              >
                <View style={[styles.switchThumb, isScheduled && styles.switchThumbActive]} />
              </TouchableOpacity>
            </View>

            {isScheduled && (
              <View style={styles.scheduleBody}>
                <View style={styles.schedulePreviewBanner}>
                  <MaterialIcons name="alarm" size={16} color={colors.FILM_GOLD} />
                  <Text style={styles.schedulePreviewText}>
                    Premiere scheduled:{' '}
                    <Text style={styles.schedulePreviewTime}>{formatScheduledDate(scheduledDateTime)}</Text>
                  </Text>
                </View>

                {/* Day Selection Pills */}
                <Text style={styles.scheduleSubLabel}>SELECT PREMIERE DAY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
                  {upcomingDays.map((day, idx) => {
                    const isSelected = selectedDayIndex === idx;
                    return (
                      <TouchableOpacity
                        key={idx}
                        activeOpacity={0.8}
                        onPress={() => setSelectedDayIndex(idx)}
                        style={[styles.dayPill, isSelected && styles.dayPillActive]}
                      >
                        <Text style={[styles.dayLabel, isSelected && styles.dayLabelActive]}>{day.label}</Text>
                        <Text style={[styles.daySub, isSelected && styles.daySubActive]}>{day.sub}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Time Selection */}
                <Text style={styles.scheduleSubLabel}>SELECT START TIME</Text>
                <View style={styles.timeChipsRow}>
                  {QUICK_TIMES.map((time, idx) => {
                    const isSelected = selectedTimeIndex === idx;
                    return (
                      <TouchableOpacity
                        key={idx}
                        activeOpacity={0.8}
                        onPress={() => setSelectedTimeIndex(idx)}
                        style={[styles.timeChip, isSelected && styles.timeChipActive]}
                      >
                        <Text style={[styles.timeChipText, isSelected && styles.timeChipTextActive]}>
                          {time.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* ── SECTION 7: DIRECT MEMBER INVITES (Collapsible) ── */}
          <View style={styles.cardContainer}>
            <TouchableOpacity
              style={styles.inviteToggleHeader}
              onPress={() => setShowEmailInvite(!showEmailInvite)}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.cardHeaderIconWrap, { backgroundColor: 'rgba(0, 200, 83, 0.12)' }]}>
                  <MaterialIcons name="person-add" size={18} color={colors.ACCEPT_GREEN} />
                </View>
                <View>
                  <Text style={styles.cardHeaderTitle}>Direct Member Invites ({inviteEmails.length})</Text>
                  <Text style={styles.cardHeaderSubtitle}>Pre-authorize connected friends & guests</Text>
                </View>
              </View>
              <MaterialIcons
                name={showEmailInvite ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                size={22}
                color={colors.SUB_TITLE_COLOR}
              />
            </TouchableOpacity>

            {showEmailInvite && (
              <View style={styles.inviteBody}>
                {/* ── SUB-SECTION: CONNECTED FRIENDS ── */}
                <View style={styles.friendsSubSection}>
                  <View style={styles.friendsSubHeader}>
                    <View style={styles.friendsSubHeaderLeft}>
                      <MaterialIcons name="people-outline" size={15} color={colors.CYAN_ACCENT} />
                      <Text style={styles.friendsSubTitle}>CONNECTED FRIENDS</Text>
                      {friendsList.length > 0 && (
                        <View style={styles.friendsCountBadge}>
                          <Text style={styles.friendsCountText}>{friendsList.length}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {loadingFriends ? (
                    <View style={styles.friendsLoadingRow}>
                      <ActivityIndicator size="small" color={colors.PRIMARY_COLOR} />
                      <Text style={styles.friendsLoadingText}>Loading connected friends...</Text>
                    </View>
                  ) : friendsList.length === 0 ? (
                    <View style={styles.friendsEmptyState}>
                      <MaterialIcons name="group" size={22} color={colors.MUTED_COLOR} />
                      <Text style={styles.friendsEmptyText}>
                        No connected friends yet. You can invite anyone by registered email or @username below.
                      </Text>
                    </View>
                  ) : (
                    <View>
                      {/* Search Filter if user has > 4 friends */}
                      {friendsList.length > 4 && (
                        <View style={styles.friendSearchCapsule}>
                          <MaterialIcons name="search" size={16} color={colors.SUB_TITLE_COLOR} />
                          <TextInput
                            style={styles.friendSearchInput}
                            placeholder="Filter friends..."
                            placeholderTextColor={colors.MUTED_COLOR}
                            value={friendSearchQuery}
                            onChangeText={setFriendSearchQuery}
                          />
                          {friendSearchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setFriendSearchQuery('')}>
                              <MaterialIcons name="close" size={16} color={colors.SUB_TITLE_COLOR} />
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {/* Horizontal Friend Cards Track */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.friendsScrollTrack}
                      >
                        {filteredFriends.map(friend => {
                          const isInvited = inviteEmails
                            .map(e => e.toLowerCase())
                            .includes(friend.email?.toLowerCase());
                          return (
                            <TouchableOpacity
                              key={friend.userId}
                              style={[styles.friendCard, isInvited && styles.friendCardInvited]}
                              onPress={() => toggleFriendInvite(friend)}
                              activeOpacity={0.8}
                            >
                              <View style={styles.friendAvatarWrap}>
                                {friend.profileImage ? (
                                  <Image source={{ uri: friend.profileImage }} style={styles.friendAvatarImg} />
                                ) : (
                                  <View style={styles.friendAvatarFallback}>
                                    <Text style={styles.friendAvatarInitial}>
                                      {(friend.username || 'F').charAt(0).toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                                {friend.isOnline && <View style={styles.friendOnlineDot} />}
                              </View>
                              <Text style={styles.friendName} numberOfLines={1}>
                                {friend.username}
                              </Text>
                              <View style={[styles.friendActionBtn, isInvited && styles.friendActionBtnInvited]}>
                                <MaterialIcons
                                  name={isInvited ? 'check' : 'add'}
                                  size={13}
                                  color={isInvited ? '#FFF' : colors.CYAN_ACCENT}
                                />
                                <Text style={[styles.friendActionText, isInvited && styles.friendActionTextInvited]}>
                                  {isInvited ? 'Invited' : 'Add'}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* ── MANUAL INVITE INPUT (EMAIL OR @USERNAME) ── */}
                <View style={styles.manualInviteHeader}>
                  <MaterialIcons name="person-search" size={14} color={colors.SUB_TITLE_COLOR} />
                  <Text style={styles.manualInviteLabel}>INVITE BY EMAIL OR @USERNAME</Text>
                </View>
                <View style={styles.emailInputRow}>
                  <TextInput
                    style={styles.emailTextInput}
                    placeholder="Enter email or @username..."
                    placeholderTextColor={colors.MUTED_COLOR}
                    value={currentEmail}
                    onChangeText={setCurrentEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={addEmail}
                  />
                  <TouchableOpacity
                    style={styles.addEmailBtn}
                    onPress={addEmail}
                    activeOpacity={0.8}
                    disabled={isSearchingUser}
                  >
                    {isSearchingUser ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.addEmailBtnText}>Add</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* ── INVITED MEMBERS CHIPS ── */}
                {inviteEmails.length > 0 && (
                  <View style={styles.invitedMembersWrap}>
                    <View style={styles.invitedMembersHeader}>
                      <Text style={styles.invitedMembersTitle}>INVITED GUESTS ({inviteEmails.length})</Text>
                      <TouchableOpacity onPress={() => setInviteEmails([])}>
                        <Text style={styles.clearAllInvitesText}>Clear all</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.invitedChipsGrid}>
                      {inviteEmails.map((email, idx) => (
                        <View key={idx} style={styles.invitedEmailChip}>
                          <View style={styles.invitedChipLeft}>
                            <MaterialIcons name="check-circle" size={14} color={colors.ACCEPT_GREEN} />
                            <Text
                              style={styles.invitedEmailText}
                              numberOfLines={1}
                              ellipsizeMode="middle"
                            >
                              {email}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => removeEmail(email)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={styles.invitedChipRemoveBtn}
                          >
                            <MaterialIcons name="close" size={15} color={colors.LIVE_RED} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Spacing for sticky bottom button */}
          <View style={{ height: 110 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── STICKY BOTTOM FLOATING CTA BAR ── */}
      <View style={[styles.stickyBottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <TouchableOpacity
          style={styles.createCtaButton}
          onPress={createRoom}
          activeOpacity={0.88}
          disabled={isCreating}
        >
          <LinearGradient
            colors={[colors.PRIMARY_COLOR, colors.PURPLE_ACCENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.createCtaGradient}
          >
            {isCreating ? (
              <ActivityIndicator color={colors.TITLE_COLOR} size="small" />
            ) : (
              <>
                <MaterialIcons name="theaters" size={22} color={colors.TITLE_COLOR} />
                <Text style={styles.createCtaText}>
                  {isEditing ? 'Update Screening Room' : 'Launch Screening Room'}
                </Text>
                <MaterialIcons name="arrow-forward" size={18} color={colors.TITLE_COLOR} />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── STYLESHEET (Cine-Sync Dark Cinema Design System) ────────────
const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
    zIndex: 0,
  },
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    zIndex: 50,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitleText: {
    color: colors.TITLE_COLOR,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerVipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.3)',
    gap: 5,
  },
  headerVipText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '700',
  },
  headerVipTextActive: {
    color: colors.FILM_GOLD,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 16,
  },

  // Form Sections
  formSection: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabelText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  instantSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  instantSyncText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },
  charCounterText: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },

  // URL Input Capsule
  urlInputCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    gap: 8,
  },
  urlInputIconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  urlTextInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '500',
    paddingVertical: 0,
  },
  urlActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  urlClearBtn: {
    padding: 2,
  },
  urlPasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    gap: 4,
  },
  urlPasteText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },

  // Live Cinema Poster Preview
  posterPreviewWrap: {
    marginTop: 4,
  },
  posterCard: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: 12,
  },
  posterTopBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  posterReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 200, 83, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.5)',
    gap: 5,
  },
  posterReadyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ACCEPT_GREEN,
  },
  posterReadyText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  posterSourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    gap: 4,
  },
  posterSourceText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  posterInfoBottom: {
    gap: 2,
  },
  posterTitleText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  posterGenreTag: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },
  posterPlaceholderBox: {
    height: 120,
    borderRadius: 16,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 6,
  },
  placeholderIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  placeholderTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },
  placeholderSubtitle: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Title Capsule
  roomNameCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  roomNameInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 0,
  },
  randomizeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },

  // Atmosphere Genres
  genreCarouselWrap: {
    marginTop: 4,
    gap: 8,
  },
  genreLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 2,
  },
  genreCarouselLabel: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  genreScrollTrack: {
    gap: 8,
    paddingVertical: 2,
  },
  genrePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    gap: 6,
  },
  genrePillSelected: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: colors.PRIMARY_COLOR,
  },
  genreLabelText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  genreLabelTextSelected: {
    color: colors.TITLE_COLOR,
    fontWeight: '700',
  },

  // Card Containers
  cardContainer: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardHeaderTextCol: {
    flex: 1,
  },
  cardHeaderTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
  },
  cardHeaderSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    marginTop: 1,
  },

  // Screening Tier Selector (Monetization)
  tierSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tierOptionCard: {
    flex: 1,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    gap: 4,
  },
  tierOptionCardActive: {
    borderColor: colors.PRIMARY_COLOR,
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
  },
  tierOptionCardVip: {
    borderColor: 'rgba(255, 180, 0, 0.25)',
  },
  tierOptionCardVipActive: {
    borderColor: colors.FILM_GOLD,
    backgroundColor: 'rgba(255, 180, 0, 0.08)',
  },
  tierTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  tierBadgeFree: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tierBadgeVip: {
    color: colors.FILM_GOLD,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tierTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },
  tierTitleVip: {
    color: colors.FILM_GOLD,
    fontSize: 13,
    fontWeight: '800',
  },
  tierPerkText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    lineHeight: 15,
  },

  // Access & Privacy Segments
  accessSegmentTrack: {
    flexDirection: 'row',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  accessSegmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  accessSegmentBtnActive: {
    backgroundColor: colors.PRIMARY_COLOR,
  },
  accessSegmentText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  accessSegmentTextActive: {
    color: colors.TITLE_COLOR,
    fontWeight: '700',
  },

  // PIN Generator
  pinSectionWrap: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  pinHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pinSectionLabel: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  pinRegenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pinRegenerateText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },
  pinDigitsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pinDigitBox: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinDigitText: {
    color: colors.TITLE_COLOR,
    fontSize: 20,
    fontWeight: '800',
  },

  // Capacity Section
  capacitySection: {
    gap: 10,
    marginTop: 4,
  },
  capacityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  capacityTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },
  capacitySubtitle: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    marginTop: 2,
    maxWidth: 200,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    paddingHorizontal: 4,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValueText: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
  sliderContainer: {
    marginTop: 2,
  },
  sliderComponent: {
    width: '100%',
    height: 30,
  },
  sliderLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sliderMinLabel: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
  },
  sliderMaxLabel: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
  },

  // Toggles
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleTextCol: {
    flex: 1,
    gap: 2,
  },
  ruleTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },
  toggleSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    lineHeight: 15,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    justifyContent: 'center',
  },
  switchTrackInactive: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  switchTrackActivePurple: {
    backgroundColor: colors.PRIMARY_COLOR,
  },
  switchTrackActiveCyan: {
    backgroundColor: colors.CYAN_ACCENT,
  },
  switchTrackActiveGold: {
    backgroundColor: colors.FILM_GOLD,
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },

  // Schedule Body
  scheduleBody: {
    gap: 12,
    marginTop: 4,
  },
  schedulePreviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 180, 0, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.25)',
    gap: 6,
  },
  schedulePreviewText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  schedulePreviewTime: {
    color: colors.FILM_GOLD,
    fontWeight: '700',
  },
  scheduleSubLabel: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  dayScroll: {
    flexDirection: 'row',
  },
  dayPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    marginRight: 8,
    alignItems: 'center',
  },
  dayPillActive: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: colors.PRIMARY_COLOR,
  },
  dayLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },
  dayLabelActive: {
    color: '#FFF',
  },
  daySub: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
  },
  daySubActive: {
    color: 'rgba(255,255,255,0.85)',
  },
  timeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  timeChipActive: {
    backgroundColor: colors.FILM_GOLD,
    borderColor: colors.FILM_GOLD,
  },
  timeChipText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  timeChipTextActive: {
    color: '#080810',
    fontWeight: '800',
  },

  // Direct Invites
  inviteToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inviteBody: {
    gap: 10,
    marginTop: 4,
  },
  emailInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  emailTextInput: {
    flex: 1,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    color: colors.TITLE_COLOR,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  addEmailBtn: {
    backgroundColor: colors.PRIMARY_COLOR,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addEmailBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  invitedEmailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.25)',
    gap: 8,
  },
  invitedChipLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  invitedEmailText: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 220,
  },
  invitedChipRemoveBtn: {
    padding: 2,
    marginLeft: 2,
  },
  // Title Auto-Fetch
  autoFetchStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginLeft: 2,
  },
  autoFetchStatusText: {
    color: colors.CYAN_ACCENT,
    fontSize: 12,
    fontWeight: '600',
  },
  autoFilledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
  },
  autoFilledBadgeText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },

  // Connected Friends Member Invites
  friendsSubSection: {
    marginBottom: 12,
  },
  friendsSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  friendsSubHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  friendsSubTitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  friendsCountBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  friendsCountText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '800',
  },
  friendsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  friendsLoadingText: {
    color: colors.MUTED_COLOR,
    fontSize: 12,
  },
  friendsEmptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  friendsEmptyText: {
    color: colors.MUTED_COLOR,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  friendSearchCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 34,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  friendSearchInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 12,
    paddingVertical: 0,
    marginLeft: 6,
  },
  friendsScrollTrack: {
    gap: 10,
    paddingVertical: 4,
  },
  friendCard: {
    width: 98,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  friendCardInvited: {
    borderColor: colors.PRIMARY_COLOR,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  friendAvatarWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  friendAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  friendAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  friendAvatarInitial: {
    color: colors.TITLE_COLOR,
    fontSize: 15,
    fontWeight: '800',
  },
  friendOnlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 3,
    backgroundColor: colors.ACCEPT_GREEN,
    borderWidth: 1.5,
    borderColor: colors.BACKGROUND_COLOR,
  },
  friendName: {
    color: colors.TITLE_COLOR,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
    marginBottom: 6,
  },
  friendActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    width: '100%',
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
  },
  friendActionBtnInvited: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: colors.PRIMARY_COLOR,
  },
  friendActionText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '700',
  },
  friendActionTextInvited: {
    color: '#FFF',
  },
  manualInviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 6,
  },
  manualInviteLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  invitedMembersWrap: {
    marginTop: 10,
  },
  invitedMembersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  invitedMembersTitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  clearAllInvitesText: {
    color: colors.LIVE_RED,
    fontSize: 11,
    fontWeight: '700',
  },
  invitedChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  // Sticky Bottom Bar
  stickyBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(8, 8, 16, 0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingTop: 12,
    zIndex: 100,
  },
  createCtaButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: colors.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  createCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  createCtaText: {
    color: colors.TITLE_COLOR,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

export default CreateRoomScreen;