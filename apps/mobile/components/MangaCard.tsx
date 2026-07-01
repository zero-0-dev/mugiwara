import { View, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Text, ProgressBar } from "react-native-paper";
import { Image } from "expo-image";
import { Manga } from "../types";
import { apiClient } from "@/api/client";

interface MangaCardProps {
  manga: Manga;
  onPress: () => void;
  width?: number;
}

export function MangaCard({ manga, onPress, width = 120 }: MangaCardProps) {
  const height = width * 1.5;
  const progress = manga.progress?.percentComplete || 0;

  const coverUrl = apiClient.getCoverUrl(manga.coverImage);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.container, { width, height }]}
      activeOpacity={0.8}
    >
      <View style={[styles.imageContainer, { width, height: width * 1.5 }]} collapsable={false}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={[styles.image, { width, height: width * 1.5 }]}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.placeholder, { width, height: width * 1.5 }]}>
            <Text style={styles.placeholderText} numberOfLines={3}>
              {manga.title}
            </Text>
          </View>
        )}
        {progress > 0 && progress < 100 && (
          <View style={styles.progressContainer}>
            <ProgressBar
              progress={progress / 100}
              color="#6366f1"
              style={styles.progressBar}
            />
          </View>
        )}
        {progress >= 100 && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedText}>✓</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={2} style={[styles.title, { width }]}>
        {manga.title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: "hidden",
  },
  imageContainer: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#333333",
    position: "relative",
  },
  image: {
    borderRadius: 8,
  },
  placeholder: {
    backgroundColor: "#333333",
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
  },
  placeholderText: {
    color: "#9ca3af",
    fontSize: 12,
    textAlign: "center",
  },
  title: {
    color: "#fff",
    fontSize: 12,
    marginTop: 4,
    fontWeight: "500",
  },
  progressContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 4,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  progressBar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  completedBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#22c55e",
    borderRadius: 12,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  completedText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
});
