import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  FlatList,
  StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Logo from '../../components/Logo1';

const FriendsScreen = ({ navigation }) => {
  const [searchEmail, setSearchEmail] = useState('');
  const [activeTab, setActiveTab] = useState('friends');

  // Dummy data for friends and requests
  const friendRequests = [
    { id: '1', email: 'john@example.com', status: 'pending' },
    { id: '2', email: 'sarah@example.com', status: 'pending' },
  ];

  const friends = [
    { id: '1', email: 'mike@example.com', status: 'online' },
    { id: '2', email: 'emma@example.com', status: 'offline' },
    { id: '3', email: 'alex@example.com', status: 'online' },
  ];

  const renderFriendRequest = ({ item }) => (
    <View style={styles.requestCard}>
      <View style={styles.requestInfo}>
        <View style={[styles.avatarContainer, { backgroundColor: generateAvatarColor(item.email) }]}>
          <Text style={styles.avatarText}>
            {item.email[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.requestTextContainer}>
          <Text style={styles.requestEmail}>{item.email}</Text>
          <Text style={styles.requestTime}>2 days ago</Text>
        </View>
      </View>
      <View style={styles.requestActions}>
        <TouchableOpacity style={styles.acceptButton}>
          <MaterialIcons name="check" size={20} color="#FFFFFF" />
          <Text style={styles.acceptButtonText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.declineButton}>
          <MaterialIcons name="close" size={20} color="#FF3B30" />
          <Text style={styles.declineButtonText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFriend = ({ item }) => (
    <View style={styles.friendCard}>
      <View style={styles.friendInfo}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>
            {item.email[0].toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={styles.friendEmail}>{item.email}</Text>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, 
              { backgroundColor: item.status === 'online' ? '#4CAF50' : '#666666' }
            ]} />
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.messageButton}
        onPress={() => navigation.navigate('Chat', { username: 'New Chat' })}
      >
        <MaterialIcons name="chat" size={20} color="#007AFF" />
      </TouchableOpacity>
    </View>
  );

  const generateAvatarColor = (email) => {
    const colors = ['#007AFF', '#FF2D55', '#5856D6', '#34C759', '#FF9500'];
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#121212" barStyle="light-content" />
      
      <View style={styles.header}>
        <Logo size="small" />
      </View>

      <View style={styles.content}>
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color="#666666" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by email..."
              placeholderTextColor="#666666"
              value={searchEmail}
              onChangeText={setSearchEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          <TouchableOpacity style={styles.addButton}>
            <MaterialIcons name="person-add" size={20} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Add Friend</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'friends' && styles.activeTab]}
            onPress={() => setActiveTab('friends')}
          >
            <Text style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}>
              Friends ({friends.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
            onPress={() => setActiveTab('requests')}
          >
            <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
              Requests ({friendRequests.length})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'friends' ? (
          <FlatList
            data={friends}
            renderItem={renderFriend}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.friendsList}
          />
        ) : (
          <FlatList
            data={friendRequests}
            renderItem={renderFriendRequest}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.friendsList}
          />
        )}
      </View>
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
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingRight: 24,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  searchSection: {
    marginBottom: 24,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#333333',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    marginLeft: 8,
    fontSize: 15,
  },
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  requestCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  requestEmail: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  declineButtonText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  friendCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#333333',
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendEmail: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: '#888888',
    fontSize: 14,
  },
  messageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestsList: {
    paddingRight: 24,
  },
  friendsList: {
    paddingBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    color: '#888888',
    fontSize: 15,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
});

export default FriendsScreen; 