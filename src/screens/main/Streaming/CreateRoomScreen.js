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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import Slider from '@react-native-community/slider';
import { auth, database } from '../../../config/firebase';
import colors from '../../../theme/Colors';
import { getYouTubeThumbnail, getYouTubeThumbnailDetails } from '../../../functions';

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

const RANDOM_TITLES = [
  'Friday Night Sci-Fi Marathon 🚀',
  'Cosmic 4K Deep Sync 🌌',
  'Cyberpunk Anime Binge ⚡',
  'Retro Classics & Popcorn 🍿',
  'Neon Midnight Screening 🎬',
  'Champions League Live Sync ⚽',
  'Anime Cinema Cozy Watch 🌿',
  'Synthwave Music Chillout 🎵',
  'Sci-Fi Mind-Bender 🌀',
  '4K IMAX Theater Party 🍿',
];

const ATMOSPHERE_GENRES = [
  { icon: '🍿', label: 'Movies' },
  { icon: '⚡', label: 'Anime' },
  { icon: '🎵', label: 'Music Videos' },
  { icon: '⚽', label: 'Sports' },
  { icon: '🎮', label: 'Gaming' },
  { icon: '✨', label: 'Custom' },
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
    editingRoom?.streamUrl || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  );
  const [roomName, setRoomName] = useState(
    editingRoom?.name || 'Friday Night Sci-Fi Marathon 🚀'
  );
  const [selectedGenre, setSelectedGenre] = useState(
    ATMOSPHERE_GENRES.find(g => g.label === editingRoom?.genre) || ATMOSPHERE_GENRES[0]
  );
  const [isPrivate, setIsPrivate] = useState(
    editingRoom?.isPrivate !== undefined ? editingRoom.isPrivate : true
  );
  const [pin, setPin] = useState(editingRoom?.pin || '8429');
  const [capacity, setCapacity] = useState(editingRoom?.maxCapacity || 12);
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

  // Premiere & Future Date Scheduling
  const [isScheduled, setIsScheduled] = useState(
    editingRoom?.isScheduled || !!editingRoom?.scheduledDate || false
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState(1); // Default to Tomorrow
  const [selectedTimeIndex, setSelectedTimeIndex] = useState(2); // Default to 8:00 PM

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

  // Email invitations (backwards compatibility)
  const [inviteEmails, setInviteEmails] = useState(editingRoom?.participants || []);
  const [showEmailInvite, setShowEmailInvite] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');

  // Pulsing dot animation for P2P Live Hub
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

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

  const addEmail = async () => {
    if (!currentEmail.trim()) return;
    const target = currentEmail.trim().toLowerCase();

    if (!target.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    if (inviteEmails.includes(target)) {
      Alert.alert('Duplicate Email', 'This email has already been added');
      return;
    }

    if (target === auth().currentUser?.email?.toLowerCase()) {
      Alert.alert('Invalid Invitation', 'You cannot invite yourself');
      return;
    }

    try {
      const userExists = await checkUserExists(target);
      if (userExists) {
        setInviteEmails([...inviteEmails, target]);
        setCurrentEmail('');
      } else {
        Alert.alert(
          'User Not Found',
          'This user is not registered in Cine-Sync. Only registered users can be invited.',
          [{ text: 'OK', onPress: () => setCurrentEmail('') }]
        );
      }
    } catch (error) {
      console.error('Error adding email:', error);
      Alert.alert('Error', 'Failed to verify user. Please try again.');
    }
  };

  const removeEmail = emailToRemove => {
    setInviteEmails(inviteEmails.filter(e => e !== emailToRemove));
  };

  const createRoom = async () => {
    if (!roomName.trim() || !streamUrl.trim()) {
      Alert.alert('Required Fields', 'Please enter a Room Name and Stream Link.');
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
          getYouTubeThumbnailDetails(streamUrl.trim())?.maxresUrl ||
          getYouTubeThumbnailDetails(streamUrl.trim())?.mqUrl ||
          getYouTubeThumbnail(streamUrl.trim()) ||
          selectedGenre.icon ||
          '🎬',
        genre: selectedGenre.label || 'Movies',
        isPrivate: isPrivate,
        pin: isPrivate ? pin : null,
        maxCapacity: capacity,
        hostOnlyControl: hostOnlyControl,
        spatialVoice: spatialVoice,
        floatingReactions: floatingReactions,
        isScheduled: isScheduled,
        scheduledDate: isScheduled ? scheduledDateTime.toISOString() : null,
        createdAt: isEditing ? editingRoom.createdAt : new Date().toISOString(),
        status: isScheduled ? 'scheduled' : 'active',
      };

      await roomRef.set(roomData);

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

  // URL Type Detection badge helper
  const isYouTube = streamUrl.toLowerCase().includes('youtube.com') || streamUrl.toLowerCase().includes('youtu.be');
  const isDirectMedia = streamUrl.toLowerCase().includes('.mp4') || streamUrl.toLowerCase().includes('.m3u8') || streamUrl.toLowerCase().includes('hls');

  return (
    <View style={styles.screenWrap}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── TOP HEADER BAR (Safe Area & Navigation) ── */}
      <View style={[styles.topHeaderBar, { paddingTop: safeTopPadding }]}>
        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back-ios-new" size={20} color={colors.TITLE_COLOR} />
        </TouchableOpacity>

        <Text style={styles.headerTitleText} numberOfLines={1}>
          {isEditing ? 'Edit Party' : 'Create Party'}
        </Text>

        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={() => Alert.alert('Options', 'Room creation shortcuts and template manager')}
          activeOpacity={0.7}
        >
          <MaterialIcons name="more-vert" size={22} color={colors.TITLE_COLOR} />
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
        >
          {/* ── TOP SUB-BAR: CLOSE + P2P STATUS BADGE + DRAFTS ── */}
          <View style={styles.subMenuBar}>
            <TouchableOpacity
              style={styles.subCloseBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.75}
            >
              <MaterialIcons name="close" size={20} color={colors.TITLE_COLOR} />
            </TouchableOpacity>

            <View style={styles.p2pStatusPill}>
              <Animated.View style={[styles.p2pPingDot, { opacity: pulseAnim }]} />
              <Text style={styles.p2pStatusText}>P2P LOW-LATENCY HUB</Text>
            </View>

            <TouchableOpacity
              style={styles.draftsPillBtn}
              onPress={() => Alert.alert('Drafts', 'No saved room drafts found.')}
              activeOpacity={0.8}
            >
              <Text style={styles.draftsBtnText}>Drafts</Text>
            </TouchableOpacity>
          </View>

          {/* ── HERO CINEMA AMBIENT CARD ── */}
          <View style={styles.heroAmbientCard}>
            {/* Background Ambient Glow Accents */}
            <View style={styles.glowOrbTopRight} />
            <View style={styles.glowOrbBottomLeft} />

            <View style={styles.heroContentRow}>
              <View style={styles.heroTextCol}>
                <Text style={styles.heroEngineTag}>SYNC ENGINE V2.4</Text>
                <Text style={styles.heroHeading}>Initialize VIP Screening</Text>
                <Text style={styles.heroSubtitle}>
                  Configure your synchronized theater room with sub-second buffer parity.
                </Text>
              </View>

              <View style={styles.heroIconCircle}>
                <MaterialIcons name="movie-filter" size={26} color={colors.PRIMARY_COLOR} />
              </View>
            </View>
          </View>

          {/* ── SECTION 1: MEDIA SOURCE URL ── */}
          <View style={styles.formSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <MaterialIcons name="link" size={16} color={colors.CYAN_ACCENT} />
                <Text style={styles.sectionLabelText}>VIDEO LINK OR STREAM URL</Text>
              </View>
              <View style={styles.instantSyncBadge}>
                <MaterialIcons name="bolt" size={14} color={colors.CYAN_ACCENT} />
                <Text style={styles.instantSyncText}>Instant Sync</Text>
              </View>
            </View>

            {/* Elevated Capsule URL Input Container */}
            <View style={styles.urlInputCapsule}>
              <View style={styles.urlInputIconWrap}>
                <MaterialIcons name="smart-display" size={20} color={colors.CYAN_ACCENT} />
              </View>
              <TextInput
                style={styles.urlTextInput}
                placeholder="Paste YouTube, MP4, HLS stream link..."
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

            {/* Platform Source Badges & Validation */}
            <View style={styles.platformBadgeRow}>
              <View style={styles.platformBadgeGroup}>
                <View style={[styles.platformPill, isYouTube && styles.platformPillActive]}>
                  <MaterialIcons name="play-circle" size={13} color={colors.LIVE_RED} />
                  <Text style={styles.platformPillText}>YouTube</Text>
                </View>
                <View style={styles.platformPill}>
                  <MaterialIcons name="live-tv" size={13} color={colors.PRIMARY_COLOR} />
                  <Text style={styles.platformPillText}>OTT Cast</Text>
                </View>
                <View style={[styles.platformPill, isDirectMedia && styles.platformPillActive]}>
                  <MaterialIcons name="code" size={13} color={colors.CYAN_ACCENT} />
                  <Text style={styles.platformPillText}>Direct MP4/HLS</Text>
                </View>
              </View>

              {streamUrl.length > 5 && (
                <View style={styles.streamSyncedBadge}>
                  <MaterialIcons name="verified" size={13} color={colors.CYAN_ACCENT} />
                  <Text style={styles.streamSyncedText}>Direct Stream Synced</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── SECTION 2: ROOM DETAILS & ATMOSPHERE ── */}
          <View style={styles.formSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <MaterialIcons name="drive-file-rename-outline" size={16} color={colors.PRIMARY_COLOR} />
                <Text style={styles.sectionLabelText}>ROOM NAME</Text>
              </View>
              <Text style={styles.charCounterText}>{roomName.length} / 50</Text>
            </View>

            {/* Room Name Input with Randomize Dice */}
            <View style={styles.roomNameCapsule}>
              <TextInput
                style={styles.roomNameInput}
                placeholder="Name your party room..."
                placeholderTextColor={colors.MUTED_COLOR}
                value={roomName}
                onChangeText={setRoomName}
                maxLength={50}
              />
              <TouchableOpacity
                style={styles.randomizeBtn}
                onPress={handleRandomizeTitle}
                activeOpacity={0.7}
              >
                <MaterialIcons name="casino" size={22} color={colors.SUB_TITLE_COLOR} />
              </TouchableOpacity>
            </View>

            {/* Atmosphere Genre Carousel */}
            <View style={styles.genreCarouselWrap}>
              <Text style={styles.genreCarouselLabel}>SELECT ATMOSPHERE GENRE</Text>
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
                      <Text style={styles.genreIconEmoji}>{genre.icon}</Text>
                      <Text style={[styles.genreLabelText, isSelected && styles.genreLabelTextSelected]}>
                        {genre.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* ── SECTION 3: PRIVACY & ACCESS CONTROL CARD ── */}
          <View style={styles.cardContainer}>
            {/* Card Header */}
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderIconWrap}>
                <MaterialIcons name="lock" size={18} color={colors.PRIMARY_COLOR} />
              </View>
              <View style={styles.cardHeaderTextCol}>
                <Text style={styles.cardHeaderTitle}>Privacy & Security</Text>
                <Text style={styles.cardHeaderSubtitle}>Gatekeep your party with VIP passcode</Text>
              </View>
            </View>

            {/* Private Room Toggle Switch */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleTitle}>Private Room (PIN Required)</Text>
                <Text style={styles.toggleSubtitle}>Only invited viewers with valid PIN can access</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.switchTrack, isPrivate ? styles.switchTrackActivePurple : styles.switchTrackInactive]}
                onPress={() => setIsPrivate(!isPrivate)}
              >
                <View style={[styles.switchThumb, isPrivate && styles.switchThumbActive]} />
              </TouchableOpacity>
            </View>

            {/* 4-Digit Security PIN Digits */}
            {isPrivate && (
              <View style={styles.pinSectionWrap}>
                <View style={styles.pinHeaderRow}>
                  <Text style={styles.pinSectionLabel}>ROOM ENTRANCE PIN</Text>
                  <TouchableOpacity
                    style={styles.pinRegenerateBtn}
                    onPress={handleRegeneratePin}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="autorenew" size={14} color={colors.PRIMARY_COLOR} />
                    <Text style={styles.pinRegenerateText}>Regenerate</Text>
                  </TouchableOpacity>
                </View>

                {/* 4 Digit Boxes */}
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
                  <Text style={styles.toggleTitle}>Max Room Capacity</Text>
                  <Text style={styles.toggleSubtitle}>Recommended 10–16 for zero audio jitter</Text>
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
                  <Text style={styles.sliderMaxLabel}>50 Seats</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── SECTION: PREMIERE SCHEDULER ── */}
          <View style={styles.cardContainer}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardHeaderIconWrap, { backgroundColor: 'rgba(255, 180, 0, 0.12)' }]}>
                <MaterialIcons name="event" size={18} color={colors.FILM_GOLD} />
              </View>
              <View style={styles.cardHeaderTextCol}>
                <Text style={styles.cardHeaderTitle}>Schedule Premiere for Later</Text>
                <Text style={styles.cardHeaderSubtitle}>Set future date & time for synchronized screening</Text>
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
                {/* Selected Premiere Highlight Banner */}
                <View style={styles.schedulePreviewBanner}>
                  <MaterialIcons name="alarm" size={16} color={colors.FILM_GOLD} />
                  <Text style={styles.schedulePreviewText}>
                    Premiere set for:{' '}
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

          {/* ── SECTION 4: SYNC PREFERENCES & HOST PRIVILEGES ── */}
          <View style={styles.cardContainer}>
            {/* Card Header */}
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardHeaderIconWrap, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
                <MaterialIcons name="tune" size={18} color={colors.CYAN_ACCENT} />
              </View>
              <View style={styles.cardHeaderTextCol}>
                <Text style={styles.cardHeaderTitle}>Playback & Room Rules</Text>
                <Text style={styles.cardHeaderSubtitle}>Stream controls & audience permissions</Text>
              </View>
            </View>

            {/* Toggle 1: Host-Only Playback Control */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <View style={styles.ruleTitleWithIcon}>
                  <Text style={styles.toggleTitle}>Host Only Playback Control</Text>
                  <MaterialIcons name="verified-user" size={16} color={colors.CYAN_ACCENT} style={{ marginLeft: 6 }} />
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
                  <Text style={styles.toggleTitle}>Spatial Voice Audio</Text>
                  <MaterialIcons name="mic" size={16} color={colors.PRIMARY_COLOR} style={{ marginLeft: 6 }} />
                </View>
                <Text style={styles.toggleSubtitle}>Low-latency acoustic channel with echo cancellation</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.switchTrack, spatialVoice ? styles.switchTrackActivePurple : styles.switchTrackInactive]}
                onPress={() => setSpatialVoice(!spatialVoice)}
              >
                <View style={[styles.switchThumb, spatialVoice && styles.switchThumbActive]} />
              </TouchableOpacity>
            </View>

            {/* Toggle 3: Floating Reactions & Haptics */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <View style={styles.ruleTitleWithIcon}>
                  <Text style={styles.toggleTitle}>Floating Reactions & Haptics</Text>
                  <MaterialIcons name="celebration" size={16} color={colors.CYAN_ACCENT} style={{ marginLeft: 6 }} />
                </View>
                <Text style={styles.toggleSubtitle}>Render interactive live reaction cascades across overlay</Text>
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

          {/* ── OPTIONAL: INVITE VIEWERS DIRECTLY BY EMAIL ── */}
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
                  <Text style={styles.cardHeaderTitle}>Direct Invites ({inviteEmails.length})</Text>
                  <Text style={styles.cardHeaderSubtitle}>Pre-authorize Cine-Sync members</Text>
                </View>
              </View>
              <MaterialIcons
                name={showEmailInvite ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                size={24}
                color={colors.SUB_TITLE_COLOR}
              />
            </TouchableOpacity>

            {showEmailInvite && (
              <View style={styles.inviteBody}>
                <View style={styles.emailInputRow}>
                  <TextInput
                    style={styles.emailTextInput}
                    placeholder="Enter friend's registered email"
                    placeholderTextColor={colors.MUTED_COLOR}
                    value={currentEmail}
                    onChangeText={setCurrentEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <TouchableOpacity
                    style={styles.addEmailBtn}
                    onPress={addEmail}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.addEmailBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>

                {inviteEmails.map((email, idx) => (
                  <View key={idx} style={styles.invitedEmailChip}>
                    <MaterialIcons name="alternate-email" size={14} color={colors.CYAN_ACCENT} />
                    <Text style={styles.invitedEmailText}>{email}</Text>
                    <TouchableOpacity onPress={() => removeEmail(email)}>
                      <MaterialIcons name="close" size={16} color={colors.LIVE_RED} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Bottom spacing so content never gets hidden behind sticky CTA button */}
          <View style={{ height: 120 }} />
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
                <MaterialIcons name="theaters" size={24} color={colors.TITLE_COLOR} />
                <Text style={styles.createCtaText}>
                  {isEditing ? 'Update & Enter Room' : 'Create & Enter Room'}
                </Text>
                <MaterialIcons name="arrow-forward" size={20} color={colors.TITLE_COLOR} />
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
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(8, 8, 16, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    zIndex: 50,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleText: {
    color: colors.TITLE_COLOR,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // Sub menu bar
  subMenuBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  subCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  p2pStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  p2pPingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.CYAN_ACCENT,
    marginRight: 6,
  },
  p2pStatusText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  draftsPillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: colors.SURFACE_COLOR,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  draftsBtnText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },

  // Hero Card
  heroAmbientCard: {
    position: 'relative',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  glowOrbTopRight: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
  },
  glowOrbBottomLeft: {
    position: 'absolute',
    bottom: -24,
    left: -24,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
  },
  heroContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  heroTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  heroEngineTag: {
    color: colors.PRIMARY_COLOR,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroHeading: {
    color: colors.TITLE_COLOR,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  heroIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Section Headers
  formSection: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionLabelText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginLeft: 6,
  },
  instantSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  instantSyncText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },

  // URL Input Capsule
  urlInputCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 24,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    height: 52,
  },
  urlInputIconWrap: {
    paddingLeft: 4,
    paddingRight: 8,
  },
  urlTextInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 14,
    paddingVertical: 0,
  },
  urlActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  urlClearBtn: {
    padding: 4,
  },
  urlPasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 4,
  },
  urlPasteText: {
    color: colors.CYAN_ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },

  // Platform Badges
  platformBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  platformBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  platformPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  platformPillActive: {
    borderColor: colors.PRIMARY_COLOR,
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
  },
  platformPillText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '600',
  },
  streamSyncedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  streamSyncedText: {
    color: colors.CYAN_ACCENT,
    fontSize: 10,
    fontWeight: '700',
  },

  // Room Name
  charCounterText: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  roomNameCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    height: 52,
  },
  roomNameInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 14,
    paddingVertical: 0,
  },
  randomizeBtn: {
    padding: 4,
  },

  // Genre Carousel
  genreCarouselWrap: {
    marginTop: 14,
  },
  genreCarouselLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  genreScrollTrack: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  genrePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 6,
  },
  genrePillSelected: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    elevation: 4,
  },
  genreIconEmoji: {
    fontSize: 14,
  },
  genreLabelText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 13,
    fontWeight: '600',
  },
  genreLabelTextSelected: {
    color: colors.TITLE_COLOR,
    fontWeight: '700',
  },

  // Cards (Privacy & Rules)
  cardContainer: {
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardHeaderTextCol: {
    flex: 1,
  },
  cardHeaderTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 16,
    fontWeight: '700',
  },
  cardHeaderSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    marginTop: 1,
  },

  // Toggles
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  toggleTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  ruleTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleTitle: {
    color: colors.TITLE_COLOR,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleSubtitle: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackActivePurple: {
    backgroundColor: colors.PURPLE_ACCENT,
    shadowColor: colors.PURPLE_ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  switchTrackActiveCyan: {
    backgroundColor: colors.CYAN_ACCENT,
    shadowColor: colors.CYAN_ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  switchTrackActiveGold: {
    backgroundColor: colors.FILM_GOLD,
    shadowColor: colors.FILM_GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },

  // Premiere Scheduler Styles
  scheduleBody: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE,
    paddingTop: 14,
    gap: 12,
  },
  schedulePreviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 180, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 8,
  },
  schedulePreviewText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  schedulePreviewTime: {
    color: colors.FILM_GOLD,
    fontWeight: '800',
  },
  scheduleSubLabel: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  dayScroll: {
    marginHorizontal: -4,
  },
  dayPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    alignItems: 'center',
    marginHorizontal: 4,
    minWidth: 70,
  },
  dayPillActive: {
    backgroundColor: 'rgba(255, 180, 0, 0.15)',
    borderColor: colors.FILM_GOLD,
  },
  dayLabel: {
    color: colors.TITLE_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },
  dayLabelActive: {
    color: colors.FILM_GOLD,
    fontWeight: '800',
  },
  daySub: {
    color: colors.MUTED_COLOR,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  daySubActive: {
    color: colors.FILM_GOLD,
  },
  timeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  timeChipActive: {
    backgroundColor: colors.PRIMARY_COLOR,
    borderColor: colors.PRIMARY_COLOR,
  },
  timeChipText: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  timeChipTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  switchTrackInactive: {
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.TITLE_COLOR,
    shadowColor: colors.BACKGROUND_COLOR,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },

  // 4-Digit PIN
  pinSectionWrap: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  pinHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pinSectionLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  pinRegenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pinRegenerateText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 12,
    fontWeight: '700',
  },
  pinDigitsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pinDigitBox: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinDigitText: {
    color: colors.TITLE_COLOR,
    fontSize: 22,
    fontWeight: '800',
  },

  // Capacity
  capacitySection: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  capacityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 20,
    padding: 3,
  },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.SURFACE_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValueText: {
    color: colors.PRIMARY_COLOR,
    fontSize: 16,
    fontWeight: '800',
    width: 36,
    textAlign: 'center',
  },
  sliderContainer: {
    marginTop: 4,
  },
  sliderComponent: {
    width: '100%',
    height: 36,
  },
  sliderLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  sliderMinLabel: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },
  sliderMaxLabel: {
    color: colors.MUTED_COLOR,
    fontSize: 11,
    fontWeight: '600',
  },

  // Invites Collapsible
  inviteToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteBody: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  emailInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  emailTextInput: {
    flex: 1,
    backgroundColor: colors.SURFACE_ELEVATED,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
    color: colors.TITLE_COLOR,
    fontSize: 13,
  },
  addEmailBtn: {
    backgroundColor: colors.ACCEPT_GREEN,
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addEmailBtnText: {
    color: colors.BACKGROUND_COLOR,
    fontSize: 13,
    fontWeight: '800',
  },
  invitedEmailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_ELEVATED,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 6,
    gap: 8,
  },
  invitedEmailText: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 12,
  },

  // Sticky Bottom CTA Bar
  stickyBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(8, 8, 16, 0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  createCtaButton: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: colors.PURPLE_ACCENT,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 8,
  },
  createCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    paddingHorizontal: 20,
    gap: 10,
  },
  createCtaText: {
    color: colors.TITLE_COLOR,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});

export default CreateRoomScreen;