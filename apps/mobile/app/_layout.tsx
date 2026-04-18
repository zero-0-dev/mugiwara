import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PaperProvider, MD3DarkTheme } from "react-native-paper";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ConfigProvider } from "@/contexts/ConfigContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#6366f1",
    secondary: "#4f46e5",
    background: "#1a1a1a",
    surface: "#252525",
    surfaceVariant: "#333333",
  },
};

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <ConfigProvider>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={theme}>
            <Stack
              screenOptions={{
                headerStyle: {
                  backgroundColor: "#1a1a1a",
                },
                headerTintColor: "#fff",
                contentStyle: {
                  backgroundColor: "#1a1a1a",
                },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen
                name="server-setup"
                options={{ headerShown: false }}
              />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="manga/[id]"
                options={{
                  title: "Manga Details",
                  headerShown: true,
                }}
              />
              <Stack.Screen
                name="reader/[mangaId]/[chapterId]"
                options={{
                  headerShown: false,
                  gestureEnabled: false,
                  animation: "none",
                  fullScreenGestureEnabled: false,
                }}
              />
            </Stack>
            <StatusBar style="auto" />
          </PaperProvider>
        </QueryClientProvider>
      </ConfigProvider>
    </ThemeProvider>
  );
}
