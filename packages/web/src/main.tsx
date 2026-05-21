import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { ConfigProvider, Spin } from 'antd';
import * as Sentry from '@sentry/react';
import { store, persistor } from './store/store';
import { themeConfig } from './configs/themeConfig';
import App from './App';
import './styles/app.less';

// Initialize Sentry only when DSN is configured at build time.
// Set VITE_SENTRY_DSN in packages/web/.env to enable.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE,
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={<Spin size="large" />} persistor={persistor}>
        <BrowserRouter>
          <ConfigProvider theme={themeConfig}>
            <App />
          </ConfigProvider>
        </BrowserRouter>
      </PersistGate>
    </Provider>
  </React.StrictMode>,
);
