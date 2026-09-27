import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../theme/Colors';

import HomeScreen from '../screens/main/HomeScreen';
import LibraryScreen from '../screens/main/Library/LibraryScreen';
import FriendsScreen from '../screens/main/Chat/FriendsScreen';
import UserProfileScreen from '../screens/main/Settings/UserProfileScreen';

const Tab = createBottomTabNavigator();

const MainTabs = () => {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => (
            <Icon
              name={focused ? 'home' : 'home-outline'}
              size={22}
              color={focused ? '#FFF' : colors.MUTED_COLOR}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarLabel: 'Library',
          tabBarIcon: ({ focused }) => (
            <Icon
              name={focused ? 'play-circle' : 'play-circle-outline'}
              size={22}
              color={focused ? '#FFF' : colors.MUTED_COLOR}
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
              size={22}
              color={focused ? '#FFF' : colors.MUTED_COLOR}
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
              size={22}
              color={focused ? '#FFF' : colors.MUTED_COLOR}
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
          transform: [{ scale: withSpring(isFocused ? 1 : 1) }],
          opacity: withSpring(isFocused ? 1 : 0.6),
        }));

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={styles.tabButton}
            activeOpacity={0.7}>
            {isFocused ? (
              <LinearGradient
                colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.activeTabBg}>
                <Animated.View style={animatedIconStyle}>
                  {options.tabBarIcon({ focused: true })}
                </Animated.View>
                <Text style={styles.tabTextFocused}>{label}</Text>
              </LinearGradient>
            ) : (
              <View style={styles.inactiveTab}>
                <Animated.View style={animatedIconStyle}>
                  {options.tabBarIcon({ focused: false })}
                </Animated.View>
                <Text style={styles.tabText}>{label}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    flexDirection: 'row',
    height: 72,
    backgroundColor: colors.SURFACE_COLOR,
    borderTopWidth: 1,
    borderTopColor: colors.BORDER_SUBTLE,
    paddingBottom: 14,
    paddingTop: 6,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTabBg: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  inactiveTab: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabText: {
    fontSize: 10.5,
    color: colors.MUTED_COLOR,
    fontWeight: '600',
  },
  tabTextFocused: {
    fontSize: 11.5,
    color: '#FFF',
    fontWeight: '800',
  },
});

export default MainTabs;
