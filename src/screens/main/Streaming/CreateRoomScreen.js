import React, { useState } from 'react';
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
} from 'react-native';
import { auth, database } from '../../../config/firebase';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../../../theme/Colors';
import { useSelector } from 'react-redux';

const CreateRoomScreen = ({ navigation, route }) => {
  const editingRoom = route.params?.room;
  const isEditing = !!editingRoom;

  const loggedInUser = useSelector(state => state.user.user);

  const [roomName, setRoomName] = useState(editingRoom?.name || '');
  const [inviteEmails, setInviteEmails] = useState(
    editingRoom?.participants || [],
  );
  const [currentEmail, setCurrentEmail] = useState('');
  const [streamUrl, setStreamUrl] = useState(editingRoom?.streamUrl || '');
  const [selectedIcon, setSelectedIcon] = useState(
    editingRoom?.thumbnail || '🎬',
  );

  const ROOM_ICONS = [
    { icon: '🎬', label: 'Movie' },
    { icon: '🎮', label: 'Gaming' },
    { icon: '🎵', label: 'Music' },
    { icon: '📺', label: 'TV Show' },
    { icon: '🎨', label: 'Art' },
    { icon: '📚', label: 'Study' },
    { icon: '💬', label: 'Chat' },
    { icon: '🎪', label: 'Event' },
  ];

  const checkUserExists = async email => {
    try {
      const snapshot = await database()
        .ref('users')
        .orderByChild('email')
        .equalTo(email)
        .once('value');
      return snapshot.exists();
    } catch (error) {
      console.log('Neww Dataabase error:', error);
      return false;
    }
  };

  const addEmail = async () => {
    if (!currentEmail) return;

    if (!currentEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    if (inviteEmails.includes(currentEmail)) {
      Alert.alert('Duplicate Email', 'This email has already been added');
      return;
    }

    if (currentEmail === auth().currentUser?.email) {
      Alert.alert('Invalid Invitation', 'You cannot invite yourself');
      return;
    }

    try {
      const userExists = await checkUserExists(currentEmail);

      if (userExists) {
        setInviteEmails([...inviteEmails, currentEmail]);
        setCurrentEmail('');
      } else {
        Alert.alert(
          'User Not Found',
          'This user is not registered in the app. Only registered users can be invited.',
          [{ text: 'OK', onPress: () => setCurrentEmail('') }],
        );
      }
    } catch (error) {
      console.error('Error adding email:', error);
      Alert.alert('Error', 'Failed to verify user. Please try again.');
    }
  };

  const removeEmail = emailToRemove => {
    setInviteEmails(inviteEmails.filter(email => email !== emailToRemove));
  };

  const createRoom = async () => {
    if (!roomName || !streamUrl) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const db = database();
    const user = auth().currentUser;

    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a room');
      return;
    }

    try {
      const invalidEmails = [];
      for (const email of inviteEmails) {
        const exists = await checkUserExists(email);
        if (!exists) {
          invalidEmails.push(email);
        }
      }

      if (invalidEmails.length > 0) {
        Alert.alert(
          'Invalid Participants',
          `Some invited users are no longer registered: ${invalidEmails.join(
            ', ',
          )}. Please remove them and try again.`,
        );
        return;
      }

      const roomId = isEditing
        ? editingRoom.roomId
        : `room_${Date.now()}`;
      const roomRef = db.ref(`rooms/${roomId}`);

      const roomData = {
        roomId: roomId,
        name: roomName,
        creator: isEditing
          ? editingRoom.creator
          : {
            uid: user.uid,
            email: user.email,
            userName: loggedInUser?.username || 'Anonymous',
          },
        streamUrl: streamUrl,
        participants: [...inviteEmails],
        thumbnail: selectedIcon,
        createdAt: isEditing
          ? editingRoom.createdAt
          : new Date().toISOString(),
        status: 'active',
      };

      console.log('Newwww Dataaa', roomData, loggedInUser);

      await roomRef.set(roomData);

      navigation.replace('WaitingScreen', {
        roomId: roomId,
        roomName: roomName,
        streamUrl: streamUrl,
      });
    } catch (error) {
      console.error('Error saving room:', error);
      Alert.alert(
        'Error',
        `Failed to ${isEditing ? 'update' : 'create'} room. Please try again.`,
      );
    }
  };

  // ────────────────────────────────────────────────────────────
  //  Render
  // ────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}>
          <MaterialIcons name="close" size={20} color={colors.TITLE_COLOR} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="film" size={18} color={colors.FILM_GOLD} />
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit Room' : 'New Screening Room'}
          </Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* ── Room Name ──────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.label}>Room Name</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons
              name="movie-creation"
              size={20}
              color={colors.FILM_GOLD}
            />
            <TextInput
              style={styles.textInput}
              placeholder="Enter room name"
              placeholderTextColor={colors.MUTED_COLOR}
              value={roomName}
              onChangeText={setRoomName}
            />
          </View>
        </View>

        {/* ── Room Icon ──────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.label}>Room Icon</Text>
          <View style={styles.iconGrid}>
            {ROOM_ICONS.map(item => (
              <TouchableOpacity
                key={item.icon}
                activeOpacity={0.8}
                onPress={() => setSelectedIcon(item.icon)}>
                {selectedIcon === item.icon ? (
                  <LinearGradient
                    colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconOptionActive}>
                    <Text style={styles.iconEmoji}>{item.icon}</Text>
                    <Text style={styles.iconLabelActive}>{item.label}</Text>
                  </LinearGradient>
                ) : (
                  <View style={styles.iconOption}>
                    <Text style={styles.iconEmoji}>{item.icon}</Text>
                    <Text style={styles.iconLabel}>{item.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Invite Users ───────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.label}>Invite Viewers</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons
              name="person-add"
              size={20}
              color={colors.CYAN_ACCENT}
            />
            <TextInput
              style={styles.textInput}
              placeholder="Enter email address"
              placeholderTextColor={colors.MUTED_COLOR}
              value={currentEmail}
              onChangeText={setCurrentEmail}
              keyboardType="email-address"
              onSubmitEditing={addEmail}
              autoCapitalize="none"
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={addEmail}>
              <LinearGradient
                colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addBtn}>
                <Text style={styles.addBtnText}>Add</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {inviteEmails.length > 0 && (
            <View style={styles.chipsWrap}>
              {inviteEmails.map(email => (
                <View key={email} style={styles.emailChip}>
                  <MaterialIcons
                    name="person"
                    size={14}
                    color={colors.PRIMARY_COLOR}
                  />
                  <Text style={styles.emailChipText}>{email}</Text>
                  <TouchableOpacity
                    onPress={() => removeEmail(email)}
                    style={styles.chipRemoveBtn}
                    activeOpacity={0.7}>
                    <MaterialIcons name="close" size={14} color={colors.SUB_TITLE_COLOR} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Stream URL ─────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.label}>Stream URL</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="link" size={20} color={colors.PURPLE_ACCENT} />
            <TextInput
              style={styles.textInput}
              placeholder="Paste YouTube or stream URL"
              placeholderTextColor={colors.MUTED_COLOR}
              value={streamUrl}
              onChangeText={setStreamUrl}
            />
          </View>
        </View>
      </ScrollView>

      {/* ── Footer ─────────────────────────────────────────── */}
      <View style={styles.footer}>
        <TouchableOpacity activeOpacity={0.85} onPress={createRoom}>
          <LinearGradient
            colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.createBtn}>
            <Ionicons
              name={isEditing ? 'checkmark-circle' : 'add-circle'}
              size={22}
              color="#FFF"
            />
            <Text style={styles.createBtnText}>
              {isEditing ? 'Save Changes' : 'Create Room'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// ──────────────────────────────────────────────────────────────
//  Styles
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BACKGROUND_COLOR,
  },

  // ── Header ────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.BORDER_SUBTLE,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
  },

  // ── Scroll Content ────────────────
  content: {
    padding: 20,
    paddingBottom: 30,
  },

  // ── Sections ──────────────────────
  section: {
    marginBottom: 26,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.TITLE_COLOR,
    marginBottom: 10,
    marginLeft: 2,
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  textInput: {
    flex: 1,
    color: colors.TITLE_COLOR,
    fontSize: 15,
    fontWeight: '400',
  },

  // ── Icon Grid ─────────────────────
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconOption: {
    width: 76,
    height: 76,
    backgroundColor: colors.SURFACE_COLOR,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.INPUTBOX_BORDER_COLOR,
  },
  iconOptionActive: {
    width: 76,
    height: 76,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconEmoji: {
    fontSize: 24,
    marginBottom: 3,
  },
  iconLabel: {
    color: colors.SUB_TITLE_COLOR,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  iconLabelActive: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },

  // ── Add Button ────────────────────
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Email Chips ───────────────────
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  emailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.CARD_COLOR,
    paddingVertical: 7,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.BORDER_SUBTLE,
    gap: 6,
  },
  emailChipText: {
    color: colors.TITLE_COLOR,
    fontSize: 13,
    fontWeight: '500',
  },
  chipRemoveBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.SURFACE_ELEVATED,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Footer ────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE,
  },
  createBtn: {
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  createBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

export default CreateRoomScreen;