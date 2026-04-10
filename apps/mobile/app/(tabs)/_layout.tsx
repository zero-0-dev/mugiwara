import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: "#1a1a1a",
          borderTopColor: "#333333",
        },
        tabBarActiveTintColor: "#6366f1",
        tabBarInactiveTintColor: "#6b7280",
        headerStyle: {
          backgroundColor: "#1a1a1a",
        },
        headerTintColor: "#fff",
      }}
    >
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="book-open-variant"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: "Categories",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="tag-multiple"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: "Queue",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="download" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
