import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from './App';
import './index.css';

if (window.electronAPI?.platform === "darwin") {
  // Window chrome is a shell concern. The app header/reader read this variable
  // instead of carrying their own platform branches.
  document.documentElement.style.setProperty("--titlebar-inset-left", "6rem");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
