# Cine-Sync UI Rules

Always adhere to these requirements prior to writing or editing any UI component or screen in this repository:

1. **Theme Tokens**: Import `colors` from `src/theme/Colors` (`import colors from '../theme/Colors'`). Use theme tokens for backgrounds, text, borders, buttons, and accents.
2. **SafeAreaView**: Wrap screen root containers in `SafeAreaView` or calculate insets using `useSafeAreaInsets()` from `react-native-safe-area-context` to prevent notch/status-bar overlapping on iOS & Android.
3. **Standardized Header**: Ensure screens requiring headers adopt the unified header structure (logo/title, safe top inset, navigation/back action, and shortcut buttons).
