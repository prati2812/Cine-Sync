import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

const CreateRoomModal = ({ visible, onClose }) => {
  const [roomName, setRoomName] = useState('');
  const [streamUrl, setStreamUrl] = useState('');

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalContainer}>
        <ScrollView style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create New Room</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Room Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter room name"
              placeholderTextColor="#666"
              value={roomName}
              onChangeText={setRoomName}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Stream URL</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter streaming URL"
              placeholderTextColor="#666"
              value={streamUrl}
              onChangeText={setStreamUrl}
            />
          </View>

          <TouchableOpacity style={styles.createButton} onPress={onClose}>
            <Text style={styles.createButtonText}>Create Room</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 32,
    borderWidth: 1,
    borderColor: '#333',
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '300',
    marginTop: -2,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
    marginLeft: 4,
  },
  textInput: {
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 16,
    height: 56,
    color: '#FFF',
    fontSize: 16,
  },
  createButton: {
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
    height: 56,
    justifyContent: 'center',
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});

export default CreateRoomModal;
