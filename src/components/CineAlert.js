// Global CineAlert Controller
// Allows triggering Cine-Sync styled dark alerts/sheets from anywhere in the codebase

let alertListener = null;

export const registerAlertListener = (listener) => {
  alertListener = listener;
};

export const unregisterAlertListener = () => {
  alertListener = null;
};

/**
 * Show custom cinema-themed alert or bottom sheet
 * @param {Object} options
 * @param {'danger' | 'action' | 'success' | 'info' | 'room'} [options.type='info'] Alert variant
 * @param {string} options.title Alert title
 * @param {string} [options.message] Alert descriptive text
 * @param {string} [options.icon] Custom MaterialIcon name
 * @param {string} [options.confirmText='OK'] Primary button label
 * @param {string} [options.cancelText] Secondary button label (if undefined, single button dialog)
 * @param {Function} [options.onConfirm] Callback when primary button is clicked
 * @param {Function} [options.onCancel] Callback when cancel/backdrop is clicked
 * @param {'center' | 'bottomSheet'} [options.presentationStyle='bottomSheet'] Dialog presentation style
 */
export const showCineAlert = (options) => {
  if (alertListener) {
    alertListener(options);
  } else {
    console.warn('[CineAlert] No alert listener registered. Ensure <CineAlertModal /> is mounted.');
  }
};

export const hideCineAlert = () => {
  if (alertListener) {
    alertListener(null);
  }
};

/**
 * Drop-in helper matching Alert.alert(title, message, buttons)
 * @param {string} title
 * @param {string} message
 * @param {Array<{text: string, onPress?: Function, style?: 'cancel' | 'destructive' | 'default'}>} buttons
 */
export const cineAlert = (title, message, buttons = [{ text: 'OK' }]) => {
  const isDestructive = buttons.some(b => b.style === 'destructive');
  const cancelBtn = buttons.find(b => b.style === 'cancel');
  const confirmBtn = buttons.find(b => b.style !== 'cancel') || buttons[0];

  showCineAlert({
    title,
    message,
    type: isDestructive ? 'danger' : 'info',
    cancelText: cancelBtn ? cancelBtn.text : undefined,
    onCancel: cancelBtn?.onPress,
    confirmText: confirmBtn ? confirmBtn.text : 'OK',
    onConfirm: confirmBtn?.onPress,
  });
};
