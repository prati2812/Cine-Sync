---
name: cine-sync-ui
description: >-
  Enforces Cine-Sync React Native UI standards including theme tokens from src/theme/Colors.js,
  notch & status bar prevention with useSafeAreaInsets(), and unified Header design patterns across screens.
---

# Cine-Sync UI Skill & Guidelines

Use this skill whenever creating, modifying, or refactoring UI screens or components in the Cine-Sync (NightWatcher) React Native codebase.

## Core Mandates

### 1. Theme Import & Color Tokens
- Always import `colors` from `src/theme/Colors` (e.g. `import colors from '../../theme/Colors'`).
- Use predefined color tokens rather than raw hex literals:
  - `colors.BACKGROUND_COLOR`
  - `colors.SURFACE_COLOR`
  - `colors.SURFACE_ELEVATED`
  - `colors.PRIMARY_COLOR`
  - `colors.PURPLE_ACCENT`
  - `colors.CYAN_ACCENT`
  - `colors.FILM_GOLD`
  - `colors.ACCEPT_GREEN`
  - `colors.LIVE_RED`

### 2. Notch & Status Bar Protection (`useSafeAreaInsets()`)
- Standard `SafeAreaView` from `react-native` alone does NOT add top padding for Android translucent status bars.
- Always compute top padding using `useSafeAreaInsets()` from `react-native-safe-area-context`:
  ```javascript
  const insets = useSafeAreaInsets();
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12
  ) + 8;
  ```

### 3. Unified Header Component Pattern
- Follow the standard `Header` component layout (`src/components/Header.js`) for screens with header bars.
- Header elements must include back/logo button, safe top inset, title styling, and action shortcuts.
