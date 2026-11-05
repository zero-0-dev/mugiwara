import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App, { THEME_STORAGE_KEY } from "./App";
import "./index.css";

// Apply the last known theme before the first paint so a light-theme user does
// not get a dark flash while /api/settings loads.
try {
  const cachedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (cachedTheme) {
    document.documentElement.dataset.theme = cachedTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        cachedTheme === "light" ? "#f4f1ed" : "#171717",
      );
  }
} catch {
  // localStorage can be unavailable; the server theme still applies later.
}

if (window.electronAPI?.platform === "darwin") {
  // Window chrome is a shell concern. The app header/reader read this variable
  // instead of carrying their own platform branches.
  document.documentElement.style.setProperty("--titlebar-inset-left", "6rem");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The server is the source of truth for library, chapter and download
      // state, and the download queue changes it in the background. Refetch on
      // mount so navigating between screens never shows stale data. The
      // remote-only discovery/search queries opt back into a longer staleTime.
      staleTime: 0,
      retry: 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
