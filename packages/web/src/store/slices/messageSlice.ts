import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface MessageState {
  rooms: any[];
  activeRoomId: string | null;
  unreadChatCount: number;
}

const initialState: MessageState = {
  rooms: [],
  activeRoomId: null,
  unreadChatCount: 0,
};

const messageSlice = createSlice({
  name: 'message',
  initialState,
  reducers: {
    setRooms: (state, action: PayloadAction<any[]>) => {
      state.rooms = action.payload;
    },
    setActiveRoomId: (state, action: PayloadAction<string | null>) => {
      state.activeRoomId = action.payload;
    },
    setUnreadChatCount: (state, action: PayloadAction<number>) => {
      state.unreadChatCount = action.payload;
    },
    addRoom: (state, action: PayloadAction<any>) => {
      state.rooms.unshift(action.payload);
    },
    updateRoom: (state, action: PayloadAction<any>) => {
      const index = state.rooms.findIndex((r) => r.id === action.payload.id);
      if (index !== -1) {
        state.rooms[index] = { ...state.rooms[index], ...action.payload };
      }
    },
    resetMessageState: () => initialState,
  },
});

export const {
  setRooms,
  setActiveRoomId,
  setUnreadChatCount,
  addRoom,
  updateRoom,
  resetMessageState,
} = messageSlice.actions;

export default messageSlice.reducer;
