import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SupportTicketState {
  currentTicketUpdate: any | null;
  unreadTicketCount: number;
}

const initialState: SupportTicketState = {
  currentTicketUpdate: null,
  unreadTicketCount: 0,
};

const supportTicketSlice = createSlice({
  name: 'supportTicket',
  initialState,
  reducers: {
    setCurrentTicketUpdate: (state, action: PayloadAction<any>) => {
      state.currentTicketUpdate = action.payload;
    },
    setUnreadTicketCount: (state, action: PayloadAction<number>) => {
      state.unreadTicketCount = action.payload;
    },
    resetSupportTicketState: () => initialState,
  },
});

export const {
  setCurrentTicketUpdate,
  setUnreadTicketCount,
  resetSupportTicketState,
} = supportTicketSlice.actions;

export default supportTicketSlice.reducer;
