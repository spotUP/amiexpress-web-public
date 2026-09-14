import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './lib/query-client';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import App from './App';
import { loadBoardFonts } from './lib/board-fonts';
import './index.css';

/*
 * Before anything mounts. The screen previews are CANVASES, and a canvas
 * never fetches a webfont however precisely it names one - so the art drew in
 * the browser's fallback until something asked. See `lib/board-fonts.ts`.
 */
void loadBoardFonts();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <RealtimeProvider>
              <App />
            </RealtimeProvider>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
