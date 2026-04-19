import React from "react";
import { View, StyleSheet } from "react-native";
import { ActivityIndicator } from "react-native-paper";

/**
 * Loading skeleton for manga detail screen
 * Shows a placeholder while manga data loads
 */
export function MangaDetailSkeleton() {
  return (
    <View style={[styles.container, styles.centered]}>
      <ActivityIndicator size="large" color="#6366f1" />
    </View>
  );
}

/**
 * Empty state when no chapters are available
 */
export function EmptyChaptersState() {
  return (
    <View style={styles.emptyContainer}>
      <ActivityIndicator size="large" color="#6366f1" />
    </View>
  );
}

/**
 * Text shown when chapters list is empty
 */
export function NoChaptersText() {
  return (
    <View style={styles.noChaptersContainer}>
      <ActivityIndicator size="large" color="#6366f1" style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
  },
  noChaptersContainer: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  loader: {
    marginTop: 32,
  },
});
