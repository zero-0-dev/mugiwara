import { Stack } from "expo-router";

export default function AddMangaLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="select" />
      <Stack.Screen name="import" />
    </Stack>
  );
}
