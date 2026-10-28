import ChatLockBottomSheet from './ChatLockBottomSheet';

/**
 * ChatLockModal is maintained as a drop-in alias to ChatLockBottomSheet
 * adhering to the Cine-Sync mandate: always use bottom sheets, never centered modals.
 */
export const ChatLockModal = ChatLockBottomSheet;
export default ChatLockBottomSheet;
