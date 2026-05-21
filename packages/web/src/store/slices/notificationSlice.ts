import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface NotificationState {
  unreadCount: number;
  notifications: any[];
}

const initialState: NotificationState = {
  unreadCount: 0,
  notifications: [],
};

const notificationSlice = createSlice({
  name: 'notification',
  initialState,
  reducers: {
    setUnreadCount: (state, action: PayloadAction<number>) => {
      state.unreadCount = action.payload;
    },
    setNotifications: (state, action: PayloadAction<any[]>) => {
      state.notifications = action.payload;
    },
    addNotification: (state, action: PayloadAction<any>) => {
      state.notifications.unshift(action.payload);
      state.unreadCount += 1;
    },
    markAsRead: (state, action: PayloadAction<string>) => {
      const notif = state.notifications.find((n) => n.id === action.payload);
      if (notif && !notif.isRead) {
        notif.isRead = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },
    markAllAsRead: (state) => {
      state.notifications.forEach((n) => (n.isRead = true));
      state.unreadCount = 0;
    },
    resetNotificationState: () => initialState,
  },
});

export const {
  setUnreadCount,
  setNotifications,
  addNotification,
  markAsRead,
  markAllAsRead,
  resetNotificationState,
} = notificationSlice.actions;

export default notificationSlice.reducer;
