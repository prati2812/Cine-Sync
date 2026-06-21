# 🎬 NightWatcher

A modern React Native mobile application that enables users to create and join collaborative video screening rooms. Watch movies, shows, and live streams together with friends in real-time synchronized viewing sessions.

## ✨ Features

### Core Functionality
- **Create Screening Rooms** — Set up private or public screening rooms for synchronized watching
- **Real-time Synchronization** — Keep video playback in sync across all participants
- **Room Management** — Create, manage, and delete screening rooms
- **Participant Tracking** — See who's watching with you and manage room members
- **Search & Filter** — Easily find rooms by name, creator, or filter by type (All/Created/Invited)
- **Smart Sorting** — Sort rooms by newest, oldest, or alphabetical order

### User Features
- **Authentication** — Secure Firebase-based sign up, login, and email verification
- **PIN Security** — Additional PIN verification layer for account security
- **User Profiles** — Customize your profile with personal information
- **Friends List** — Connect with other users and see friends' activity
- **Real-time Chat** — Communicate with other room participants
- **Settings & Preferences** — Configure app settings, notifications, and preferences

### Advanced Capabilities
- **Video Streaming** — Support for multiple video sources and streaming protocols
- **WebRTC Integration** — Peer-to-peer communication for low-latency interactions
- **Gesture Controls** — Native gesture handling for intuitive UI interactions
- **Animated UI** — Smooth animations and transitions powered by React Native Reanimated
- **Dark Theme** — Eye-friendly dark interface optimized for viewing
- **Cross-Platform** — Available on both iOS and Android

## 🏗️ Project Structure

```
NightWatcher/
├── src/
│   ├── screens/
│   │   ├── auth/                 # Authentication screens
│   │   │   ├── LoginScreen.js
│   │   │   ├── SignUpScreen.js
│   │   │   ├── VerifyEmailScreen.js
│   │   │   ├── PINVerificationScreen.js
│   │   │   └── ForgetPasswordScreen.js
│   │   ├── main/                 # Main app screens
│   │   │   ├── HomeScreen.js     # Room list and management
│   │   │   ├── Streaming/
│   │   │   │   ├── StreamingScreen.js
│   │   │   │   ├── CreateRoomScreen.js
│   │   │   │   ├── WaitingScreen.js
│   │   │   │   └── StreamInfoScreen.js
│   │   │   ├── Chat/
│   │   │   │   ├── ChatScreen.js
│   │   │   │   └── FriendsScreen.js
│   │   │   └── Settings/
│   │   │       ├── SettingsScreen.js
│   │   │       ├── UserProfileScreen.js
│   │   │       ├── SetupPINScreen.js
│   │   │       └── HelpAndSupportScreen.js
│   ├── components/               # Reusable components
│   │   ├── UI/
│   │   │   ├── CustomInput.js
│   │   │   └── RoundButton.js
│   │   ├── Logo.js
│   │   ├── AnimatedLoader.js
│   │   ├── CreateRoomModal.js
│   │   └── ...
│   ├── navigation/               # Navigation configuration
│   │   ├── AppNavigator.js
│   │   └── MainTabs.js
│   ├── webRTC/                   # WebRTC functionality
│   │   └── useAudioCall.js
│   ├── store/                    # Redux state management
│   │   ├── store.js
│   │   └── slices/
│   │       └── user/userSlice.js
│   ├── theme/                    # Theming
│   │   └── Colors.js
│   ├── functions/                # Utility functions
│   │   └── index.js
│   └── config/                   # Configuration
│       └── firebase.js           # Firebase setup
├── ios/                          # iOS native code
├── android/                      # Android native code
├── package.json                  # Dependencies and scripts
└── App.js                        # App entry point
```

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18
- Yarn or npm
- iOS: Xcode and CocoaPods
- Android: Android Studio and Android SDK

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd NightWatcher
   ```

2. **Install dependencies**
   ```bash
   yarn install
   # or
   npm install
   ```

3. **iOS Setup** (first time or after updating native dependencies)
   ```bash
   cd ios
   bundle install
   bundle exec pod install
   cd ..
   ```

4. **Configure Firebase**
   - Set up your Firebase project
   - Add your Firebase configuration to `src/config/firebase.js`
   - Ensure Firebase authentication, database, and storage are enabled

5. **Start Metro bundler**
   ```bash
   yarn start
   # or
   npm start
   ```

6. **Run the app**
   ```bash
   # iOS
   yarn ios
   # or
   npm run ios

   # Android
   yarn android
   # or
   npm run android
   ```

## 📱 Key Technologies

- **React Native 0.80.1** — Cross-platform mobile framework
- **React 19.1.0** — UI library
- **Firebase** — Backend services (Authentication, Realtime Database)
- **Redux Toolkit** — State management
- **React Navigation** — Navigation library
- **React Native Reanimated** — Advanced animations
- **WebRTC** — Real-time communication
- **React Native Video** — Video playback

## 🎯 Core Features Explained

### Room Management
Users can create screening rooms and invite friends. Room creators have full control including:
- Starting/stopping the stream
- Adding or removing participants
- Deleting the room
- Controlling playback synchronization

### Streaming
Once in a room, users experience:
- Synchronized video playback across all devices
- Real-time chat during streaming
- Participant count and presence indicators
- Stream quality and playback controls

### Authentication
- Email/password registration and login
- Email verification for security
- PIN-based account recovery
- Password reset functionality

## 🧪 Scripts

```bash
# Start development server
yarn start

# Run iOS app
yarn ios

# Run Android app
yarn android

# Lint code
yarn lint

# Run tests
yarn test
```

## 🔧 Configuration

### Firebase Setup
Edit `src/config/firebase.js` with your Firebase credentials:
```javascript
// Example structure
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  // ... other config
};
```

### Theme Customization
Colors and theme are defined in `src/theme/Colors.js`. Customize the design by modifying color constants.

## 📚 Project Scripts

- **Android**: `npm run android` — Build and run on Android emulator/device
- **iOS**: `npm run ios` — Build and run on iOS simulator/device
- **Lint**: `npm run lint` — Run ESLint to check code quality
- **Start**: `npm start` — Start Metro bundler
- **Test**: `npm test` — Run Jest tests

## 🐛 Troubleshooting

### Metro Connection Issues
```bash
# Clear cache and restart
npm start -- --reset-cache
```

### Pod Installation Issues (iOS)
```bash
cd ios
rm -rf Pods
rm Podfile.lock
bundle install
bundle exec pod install
cd ..
```

### Build Issues
- Clear build folders: `npm run clean` or manual deletion
- Ensure correct Node version (18+)
- Check Firebase configuration
- Verify all dependencies are installed

## 📖 Learn More

- [React Native Documentation](https://reactnative.dev)
- [Firebase Documentation](https://firebase.google.com/docs)
- [React Navigation Docs](https://reactnavigation.org)
- [Redux Toolkit Guide](https://redux-toolkit.js.org)

## 🎨 Design System

NightWatcher features a modern dark theme with:
- Gradient overlays for visual hierarchy
- Smooth animations and transitions
- Intuitive gesture controls
- Accessible color contrasts
- Icon-based navigation

## 📄 License

Private project. All rights reserved.

## 👨‍💻 Development

- **Current Branch**: `UPDATE_UI`
- **Latest Version**: 0.0.1
- **Node Requirements**: >= 18
- **React Native**: 0.80.1

---

**Last Updated**: 2026-06-21

For issues, feature requests, or questions, please contact the development team.
