import { configureStore, combineReducers } from '@reduxjs/toolkit';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import storageSession from 'redux-persist/lib/storage/session';
import authReducer from './slices/authSlice';
import orderReducer from './slices/orderSlice';
import messageReducer from './slices/messageSlice';
import invoiceReducer from './slices/invoiceSlice';
import notificationReducer from './slices/notificationSlice';
import supportTicketReducer from './slices/supportTicketSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  order: orderReducer,
  message: messageReducer,
  invoice: invoiceReducer,
  notification: notificationReducer,
  supportTicket: supportTicketReducer,
});

const persistConfig = {
  key: 'curavend',
  version: 1,
  storage: storageSession,
  whitelist: ['auth'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
