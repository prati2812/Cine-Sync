import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import colors from '../theme/Colors';
import { auth, database } from '../config/firebase';

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

const TabBarButton = ({
  route,
  descriptor,
  isFocused,
  totalUnread,
  onPress,
}) => {
  const { options } = descriptor;
  const label = options.tabBarLabel || route.name;
  const isFriends = route.name === 'Friends';

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isFocused ? 1 : 1) }],
    opacity: withSpring(isFocused ? 1 : 0.6),
  }));

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.tabButton}
      activeOpacity={0.7}>
      {isFocused ? (
        <LinearGradient
          colors={[colors.GRADIENT_START, colors.GRADIENT_END]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.activeTabBg}>
          <View style={styles.iconWrap}>
            <Animated.View style={animatedIconStyle}>
              {options.tabBarIcon({ focused: true })}
            </Animated.View>
            {isFriends && totalUnread > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>
                  {totalUnread > 99 ? '99+' : totalUnread}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.tabTextFocused}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={styles.inactiveTab}>
          <View style={styles.iconWrap}>
            <Animated.View style={animatedIconStyle}>
              {options.tabBarIcon({ focused: false })}
            </Animated.View>
            {isFriends && totalUnread > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>
                  {totalUnread > 99 ? '99+' : totalUnread}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.tabText}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const CustomTabBar = ({ state, descriptors, navigation }) => {
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    let unsubs = [];
    const attach = (user) => {
      unsubs.forEach(f => f());
      unsubs = [];
      if (!user) {
        setTotalUnread(0);
        return;
      }
      const ref = database().ref(`user_chats/${user.uid}`);
      const cb = ref.on('value', (snap) => {
        const val = snap.val();
        if (val && typeof val === 'object') {
          let sum = 0;
          Object.keys(val).forEach((k) => {
            if (val[k] && typeof val[k].unreadCount === 'number') {
              sum += val[k].unreadCount;
            }
          });
          setTotalUnread(sum);
        } else {
          setTotalUnread(0);
        }
      });
      unsubs.push(() => ref.off('value', cb));
    };

    const current = auth().currentUser;
    if (current) attach(current);
    const authUnsub = auth().onAuthStateChanged(attach);
    return () => {
      authUnsub();
      unsubs.forEach(f => f());
    };
  }, []);

  return (
    <View style={styles.tabBarContainer}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const onPress = () => {
          if (!isFocused) navigation.navigate(route.name);
        };

        return (
          <TabBarButton
            key={route.key}
            route={route}
            descriptor={descriptors[route.key]}
            isFocused={isFocused}
            totalUnread={totalUnread}
            onPress={onPress}
          />
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
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadge: {
    position: 'absolute',
    top: -5,
    right: -10,
    backgroundColor: colors.ACCEPT_GREEN,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.SURFACE_COLOR,
  },
  tabBadgeText: {
    color: '#080810',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 12,
  },
});

export default MainTabs;
