import React, { useCallback } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, Surface } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ChapterProgressIndicator } from "./ChapterProgressIndicator";
import type { Chapter, ReadingProgress } from "@/types";

interface ChapterItemProps {
  chapter: Chapter;
  progress: ReadingProgress | undefined;
  isCurrent: boolean;
  onPress: (chapterId: string) => void;
  onLongPress: (chapter: Chapter) => void;
}

const ICON_SIZE = 16;
const ICON_COLOR = "#6366f1";
const LONG_PRESS_DELAY = 500;

/**
 * Chapter item component - extracted to prevent re-renders
 * Following React Native Skills:
 * - 2.3: Keep list items lightweight (no hooks, minimal logic)
 * - 2.5: Pass primitives for effective memoization
 * - 1.1: Never use && with potentially falsy values (use ternary)
 */
export const ChapterItem = React.memo(function ChapterItem({
  chapter,
  progress,
  isCurrent,
  onPress,
  onLongPress,
}: ChapterItemProps) {
  // Use ID for callback to maintain stable reference
  const handlePress = useCallback(() => {
    onPress(chapter.id);
  }, [chapter.id, onPress]);

  const handleLongPress = useCallback(() => {
    onLongPress(chapter);
  }, [chapter, onLongPress]);

  return (
    <Surface
      style={[styles.chapterSurface, isCurrent && styles.currentChapter]}
    >
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={LONG_PRESS_DELAY}
        style={styles.pressable}
        android_ripple={{ color: "rgba(255, 255, 255, 0.1)" }}
      >
        <View style={styles.chapterRow}>
          <ChapterProgressIndicator progress={progress} />
          <Text style={styles.chapterText} numberOfLines={1}>
            Chapter {chapter.chapterId}
            {chapter.title ? ` - ${chapter.title}` : ""}
          </Text>
          {chapter.importStatus !== "complete" ? (
            <MaterialCommunityIcons
              name="download"
              size={ICON_SIZE}
              color={ICON_COLOR}
            />
          ) : null}
        </View>
      </Pressable>
    </Surface>
  );
});

const styles = StyleSheet.create({
  chapterSurface: {
    backgroundColor: "#252525",
    borderRadius: 8,
    marginVertical: 4,
    elevation: 1,
  },
  currentChapter: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
  },
  pressable: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  chapterText: {
    color: "#d1d5db",
    fontSize: 14,
    flex: 1,
  },
});
