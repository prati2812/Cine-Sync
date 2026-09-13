# Cine-Sync UI Rules

Always adhere to these requirements prior to writing or editing any UI component or screen in this repository:

1. **Theme Tokens**: Import `colors` from `src/theme/Colors` (`import colors from '../theme/Colors'`). Use theme tokens for backgrounds, text, borders, buttons, and accents.
2. **SafeAreaView**: Wrap screen root containers in `SafeAreaView` or calculate insets using `useSafeAreaInsets()` from `react-native-safe-area-context` to prevent notch/status-bar overlapping on iOS & Android.
3. **Standardized Header**: Ensure screens requiring headers adopt the unified header structure (logo/title, safe top inset, navigation/back action, and shortcut buttons).
4. **Squircle Shapes (No Circular Backgrounds)**: Avoid circular backgrounds, avatar rings, or circular orbs (`borderRadius: width / 2`). Use modern squircle radiuses (`borderRadius: 8-16`).
5. **Production-Ready & Zero-Lag**: Ensure 60/120 FPS buttery-smooth performance. Use `useNativeDriver: true` for animations, memoize lists/callbacks to avoid unnecessary re-renders, debounce inputs, and implement scalable, modular architectures.
6. **Vector Icons Exclusively (NO Emojis)**: Always use professional vector icon packages (`MaterialIcons`, `Ionicons`, etc.) for buttons, chips, genre badges, cards, indicators, and actions. NEVER use raw unicode emojis (🍿, ⚡, 🎲, etc.) in production UI components.
