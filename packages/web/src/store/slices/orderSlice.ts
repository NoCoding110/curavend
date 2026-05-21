import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface OrderState {
  currentOrderUpdate: any | null;
  currentNewOrderUpdate: any | null;
  unreadOrderCount: number;
  chartType: string;
  orderSigns: any[];
}

const initialState: OrderState = {
  currentOrderUpdate: null,
  currentNewOrderUpdate: null,
  unreadOrderCount: 0,
  chartType: 'bar',
  orderSigns: [],
};

const orderSlice = createSlice({
  name: 'order',
  initialState,
  reducers: {
    setCurrentOrderUpdate: (state, action: PayloadAction<any>) => {
      state.currentOrderUpdate = action.payload;
    },
    setCurrentNewOrderUpdate: (state, action: PayloadAction<any>) => {
      state.currentNewOrderUpdate = action.payload;
    },
    setUnreadOrderCount: (state, action: PayloadAction<number>) => {
      state.unreadOrderCount = action.payload;
    },
    setChartType: (state, action: PayloadAction<string>) => {
      state.chartType = action.payload;
    },
    setOrderSigns: (state, action: PayloadAction<any[]>) => {
      state.orderSigns = action.payload;
    },
    resetOrderState: () => initialState,
  },
});

export const {
  setCurrentOrderUpdate,
  setCurrentNewOrderUpdate,
  setUnreadOrderCount,
  setChartType,
  setOrderSigns,
  resetOrderState,
} = orderSlice.actions;

export default orderSlice.reducer;
