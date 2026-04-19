import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CircularProgress } from "./CircularProgress";
import type { ReadingProgress } from "@/types";

interface ChapterProgressIndicatorProps {
  progress: ReadingProgress | null | undefined;
}

const COMPLETION_THRESHOLD = 95;
const EMPTY_PROGRESS_SIZE = 24;
const EMPTY_PROGRESS_RADIUS = 12;
const ICON_SIZE_RATIO = 0.6;

/**
 * Completed chapter indicator
 * Shows a checkmark inside a circle
 */
function CompletedIndicator({
  size = EMPTY_PROGRESS_SIZE,
  color = "#6366f1",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <View
      style={[
        styles.completedIndicator,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
        },
      ]}
    >
      <MaterialCommunityIcons
        name="check"
        size={size * ICON_SIZE_RATIO}
        color={color}
      />
    </View>
  );
}

/**
 * Chapter progress indicator component
 * Displays different states based on reading progress:
 * - Empty circle: No progress
 * - Checkmark: Completed or >=95%
 * - Circular progress: Partial progress (1-94%)
 * - Outlined circle: Started but no measurable progress
 */
export function ChapterProgressIndicator({
  progress,
}: ChapterProgressIndicatorProps) {
  // No progress - show empty circle
  if (!progress) {
    return (
      <View
        style={[
          styles.emptyProgress,
          {
            width: EMPTY_PROGRESS_SIZE,
            height: EMPTY_PROGRESS_SIZE,
            borderRadius: EMPTY_PROGRESS_RADIUS,
          },
        ]}
      />
    );
  }

  // Completed or nearly completed - show checkmark
  if (
    progress.isCompleted ||
    progress.percentComplete >= COMPLETION_THRESHOLD
  ) {
    return <CompletedIndicator size={EMPTY_PROGRESS_SIZE} />;
  }

  // Partial progress - show circular progress
  const roundedProgress = Math.round(progress.percentComplete);

  if (roundedProgress >= 0 && roundedProgress < COMPLETION_THRESHOLD) {
    return (
      <CircularProgress progress={roundedProgress} size={EMPTY_PROGRESS_SIZE} />
    );
  }

  // Started but no measurable progress - show outlined circle
  return (
    <View
      style={[
        styles.startedProgress,
        {
          width: EMPTY_PROGRESS_SIZE,
          height: EMPTY_PROGRESS_SIZE,
          borderRadius: EMPTY_PROGRESS_RADIUS,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  completedIndicator: {
    borderWidth: 2,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyProgress: {
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  startedProgress: {
    borderWidth: 2,
    borderColor: "#6366f1",
  },
});
