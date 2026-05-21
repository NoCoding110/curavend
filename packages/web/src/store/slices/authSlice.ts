import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  userType: string;
  providerId?: string;
  hospitalId?: string;
  vendorId?: string;
  superVendorId?: string;
  hasAgreedToPHIAccess?: boolean;
}

export interface AuthState {
  token: string | null;
  refreshToken: string | null;
  userData: UserData | null;
  planFeatures: string[];
  planId: string | null;
  planName: string | null;
  reportingOptions: string[];
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  token: null,
  refreshToken: null,
  userData: null,
  planFeatures: [],
  planId: null,
  planName: null,
  reportingOptions: [],
  isAuthenticated: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{
        token: string;
        refreshToken: string;
        userData: UserData;
      }>,
    ) => {
      state.token = action.payload.token;
      state.refreshToken = action.payload.refreshToken;
      state.userData = action.payload.userData;
      state.isAuthenticated = true;
    },
    setToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
    },
    setUserData: (state, action: PayloadAction<Partial<UserData>>) => {
      if (state.userData) {
        state.userData = { ...state.userData, ...action.payload };
      }
    },
    setPlanFeatures: (state, action: PayloadAction<string[]>) => {
      state.planFeatures = action.payload;
    },
    setPlanInfo: (
      state,
      action: PayloadAction<{ planId: string; planName: string }>,
    ) => {
      state.planId = action.payload.planId;
      state.planName = action.payload.planName;
    },
    setReportingOptions: (state, action: PayloadAction<string[]>) => {
      state.reportingOptions = action.payload;
    },
    logout: () => {
      localStorage.clear();
      return initialState;
    },
  },
});

export const {
  setCredentials,
  setToken,
  setUserData,
  setPlanFeatures,
  setPlanInfo,
  setReportingOptions,
  logout,
} = authSlice.actions;

export default authSlice.reducer;
