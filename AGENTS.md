# Cine-Sync (NightWatcher) - Workspace Coding & UI Guidelines

Whenever generating, modifying, or refactoring code for this React Native codebase, you MUST strictly enforce the following mandatory guidelines:

---

## 🎨 1. Theme & Color Tokens (`src/theme/Colors.js`)
- **MANDATORY**: Always import and reference color tokens from `src/theme/Colors` (e.g., `import colors from '../../theme/Colors'`).
- **NO HARDCODED COLORS**: Do not hardcode hex values (e.g., `#080810`, `#007AFF`) in inline styles or `StyleSheet.create`. Use defined tokens:
  - `colors.BACKGROUND_COLOR` (`#080810` / Deep Midnight)
  - `colors.SURFACE_COLOR` (`#0F0F1A` / Surface)
  - `colors.SURFACE_ELEVATED` (`#161625` / Elevated Cards)
  - `colors.PRIMARY_COLOR` (`#007AFF` / Primary Electric Blue)
  - `colors.PURPLE_ACCENT` (`#7C3AED` / Neon Purple)
  - `colors.CYAN_ACCENT` (`#06B6D4` / Cyan Highlight)
  - `colors.FILM_GOLD` (`#FFB400` / Cinema Gold)
  - `colors.LIVE_RED` / `colors.DELETE_RED_COLOR` (`#EF4444` / `#FF3B30`)
  - `colors.ACCEPT_GREEN` (`#00C853`)

---

## 📱 2. Notch & Safe Area Handling (`useSafeAreaInsets()`)
- **MANDATORY**: On Android and iOS, standard `SafeAreaView` alone DOES NOT handle translucent Android status bars. Every screen container/header MUST use `useSafeAreaInsets()` from `react-native-safe-area-context` with dynamic top padding:
  ```javascript
  const insets = useSafeAreaInsets();
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;
  ```
- **CROSS-PLATFORM NOTCH PROTECTION**: Ensure top headers, status bars, and floating docks never clip into physical camera notches or Android/iOS status bars.

---

## HEADER 3. Consistent Header Pattern
- **MANDATORY**: Whenever a screen requires a top header bar, follow the established header design pattern used in `HomeScreen` / `src/components/Header.js`.
- Include safe-area top padding, brand/title typography, left back or brand icon button, and right status or action shortcuts.
