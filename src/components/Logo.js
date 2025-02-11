import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

const Logo = ({ size = 'large' }) => {
  const iconSize = size === 'large' ? 52 : 36;
  const scale = size === 'large' ? 1 : 0.8;

  return (
    <View style={styles.container}>
      <View style={[styles.logoContainer, { transform: [{ scale }] }]}>
        <View style={styles.iconBackground}>
          <Icon name="film-outline" size={iconSize} color="#FFFFFF" />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.logoText}>CINE</Text>
          <Text style={styles.logoTextAccent}>SYNC</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    alignItems: 'center',
  },
  iconBackground: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    padding: 16,
    elevation: 8,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  textContainer: {
    flexDirection: 'row',
    marginTop: 16,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  logoTextAccent: {
    fontSize: 32,
    fontWeight: '900',
    color: '#007AFF',
    letterSpacing: 4,
    textShadowColor: 'rgba(0, 122, 255, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
});

export default Logo; 