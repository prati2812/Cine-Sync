import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, Animated, ScrollView } from 'react-native';
import { getDatabase, ref, onValue } from 'firebase/database';
import { auth } from '../../../config/firebase';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const WaitingScreen = ({ route, navigation }) => {
  const { roomId, roomName, streamUrl } = route.params;
  const [participants, setParticipants] = useState([]);
  const [isStreamingAllowed, setIsStreamingAllowed] = useState(false);
  const currentUser = auth.currentUser;
  const [rotationAnim] = useState(new Animated.Value(0));

  const mockParticipants = [
    { id: 1, name: 'John Doe', username: '@johndoe', color: '#FF6B6B', avatar: '👤', isHost: true },
    { id: 2, name: 'Jane Smith', username: '@janesmith', color: '#4ECDC4', avatar: '👤' },
    { id: 3, name: 'Mike Johnson', username: '@mikej', color: '#45B7D1', avatar: '👤' },
  ];

  useEffect(() => {
    const db = getDatabase();
    const roomRef = ref(db, `rooms/${roomId}/participants`);

    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setParticipants(data);
        setIsStreamingAllowed(data.includes(currentUser.email));
      }
    });

    return () => unsubscribe();
  }, [roomId, currentUser]);

  useEffect(() => {
    const startRotationAnimation = () => {
      Animated.loop(
        Animated.timing(rotationAnim, {
          toValue: 1,
          duration: 10000, // 10 seconds per rotation
          useNativeDriver: true,
        })
      ).start();
    };

    startRotationAnimation();
  }, []);

  const startStreaming = () => {
    if (currentUser.email !== participants[0]) {
      navigation.navigate('Streaming', { roomId, roomName, streamUrl });
    } else {
      alert('Only the room creator can start the streaming.');
    }
  };

  const renderParticipantDots = () => {
    const radius = 125;
    return mockParticipants.map((participant, index) => {
      const angle = (2 * Math.PI * index) / mockParticipants.length - Math.PI / 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);

      return (
        <View
          key={participant.id}
          style={[
            styles.participantDot,
            { 
              backgroundColor: participant.color,
              transform: [
                { translateX: x },
                { translateY: y },
              ],
              position: 'absolute',
            }
          ]}
        >
          <Text style={styles.participantAvatar}>{participant.avatar}</Text>
          <View style={styles.participantLabel}>
            <Text style={styles.participantLabelText}>{participant.username}</Text>
          </View>
        </View>
      );
    });
  };

  const renderParticipantsList = () => {
    return (
      <View style={styles.participantsList}>
        {mockParticipants.map((participant) => (
          <View key={participant.id} style={styles.participantItem}>
            <View style={[styles.participantIcon, { backgroundColor: participant.color }]}>
              <Text style={styles.participantAvatar}>{participant.avatar}</Text>
            </View>
            <View style={styles.participantInfo}>
              <Text style={styles.participantName}>{participant.name}</Text>
              <Text style={styles.participantUsername}>{participant.username}</Text>
            </View>
            {participant.isHost && (
              <View style={styles.hostBadge}>
                <Text style={styles.hostBadgeText}>Host</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.roomName}>Waiting Room</Text>
      </View>

     <ScrollView
        style={{flex:1}}
        showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <View style={styles.animationContainer}>
          <Animated.View
            style={[
              styles.circle,
              {
                transform: [{
                  rotate: rotationAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg']
                  })
                }]
              }
            ]}
          />
          <Animated.View
            style={[
              styles.innerCircle,
              {
                transform: [{
                  rotate: rotationAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['360deg', '0deg']
                  })
                }]
              }
            ]}
          />
          <View style={styles.participantsContainer}>
            {renderParticipantDots()}
            <View style={styles.centerButtonContainer}>
              <TouchableOpacity
                style={styles.centerButton}
                onPress={startStreaming}
                disabled={false}
              >
                <MaterialIcons name="play-arrow" size={40} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Text style={styles.waitingText}>Waiting for participants...</Text>
        {renderParticipantsList()}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    marginBottom:20,
  },
  backButton: {
    padding: 8,
  },
  roomName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 16,
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  animationContainer: {
    width: 340,
    height: 340,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  participantsContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  circle: {
    width: '100%',
    height: '100%',
    borderRadius: 170,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    position: 'absolute',
    borderStyle: 'dashed',
  },
  innerCircle: {
    width: '80%',
    height: '80%',
    borderRadius: 140,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    position: 'absolute',
    borderStyle: 'dashed',
  },
  participantDot: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  participantAvatar: {
    fontSize: 24,
    color: '#FFFFFF',
  },
  participantLabel: {
    position: 'absolute',
    bottom: -25,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 80,
  },
  participantLabelText: {
    color: '#FFFFFF',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  participantsList: {
    marginTop: 40,
    width: '100%',
    paddingHorizontal: 20,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  participantIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  participantUsername: {
    color: '#AAAAAA',
    fontSize: 14,
    marginTop: 2,
  },
  hostBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  hostBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  centerButtonContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
    position: 'absolute',
  },
  centerButton: {
    width: '100%',
    height: '100%',
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
  },
  waitingText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 30,
    letterSpacing: 0.5,
  },
});

export default WaitingScreen; 