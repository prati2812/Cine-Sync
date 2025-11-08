import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';

import HomeScreen from '../screens/main/HomeScreen';
import FriendsScreen from '../screens/main/Chat/FriendsScreen';
import UserProfileScreen from '../screens/main/Settings/UserProfileScreen';

const Tab = createBottomTabNavigator();

const MainTabs = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => (
            <Icon
              name={focused ? 'home' : 'home-outline'}
              size={24}
              color={focused ? '#007AFF' : '#8E8E93'}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsScreen}
        options={{
          tabBarLabel: 'Friends',
          tabBarIcon: ({ focused }) => (
            <Icon
              name={focused ? 'people' : 'people-outline'}
              size={24}
              color={focused ? '#007AFF' : '#8E8E93'}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={UserProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => (
            <Icon
              name={focused ? 'person' : 'person-outline'}
              size={24}
              color={focused ? '#007AFF' : '#8E8E93'}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const CustomTabBar = ({ state, descriptors, navigation }) => {
  return (
    <View style={styles.tabBarContainer}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel || route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          if (!isFocused) navigation.navigate(route.name);
        };

        const animatedIconStyle = useAnimatedStyle(() => ({
          transform: [{ scale: withSpring(isFocused ? 1.2 : 1) }],
          opacity: withSpring(isFocused ? 1 : 0.7),
        }));

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={[styles.tabButton, isFocused && styles.tabButtonFocused]}
            activeOpacity={0.7}
          >
            <Animated.View style={animatedIconStyle}>
              {options.tabBarIcon({ focused: isFocused })}
            </Animated.View>
            <Text style={[styles.tabText, isFocused && styles.tabTextFocused]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    flexDirection: 'row',
    height: 80,
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
    paddingBottom: 20,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
  },
  tabButtonFocused: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 16,
  },
  tabText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  tabTextFocused: {
    color: '#007AFF',
    fontWeight: '600',
  },
});

export default MainTabs;
