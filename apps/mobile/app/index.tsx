import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useConfig } from "@/contexts/ConfigContext";

export default function Index() {
  const { isConfigured, isLoading } = useConfig();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#1a1a1a",
        }}
      >
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // if (!isConfigured) {
  //   return <Redirect href="/server-setup" />;
  // }

  return <Redirect href="/(tabs)/library" />;
}
