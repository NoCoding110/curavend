import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface InvoiceState {
  currentInvoiceUpdate: any | null;
}

const initialState: InvoiceState = {
  currentInvoiceUpdate: null,
};

const invoiceSlice = createSlice({
  name: 'invoice',
  initialState,
  reducers: {
    setCurrentInvoiceUpdate: (state, action: PayloadAction<any>) => {
      state.currentInvoiceUpdate = action.payload;
    },
    resetInvoiceState: () => initialState,
  },
});

export const { setCurrentInvoiceUpdate, resetInvoiceState } =
  invoiceSlice.actions;

export default invoiceSlice.reducer;
