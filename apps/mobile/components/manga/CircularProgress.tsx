import React from "react";
import { View } from "react-native";

interface CircularProgressProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}

/**
 * Circular progress indicator component
 * Renders a circular progress ring using CSS border tricks
 */
export function CircularProgress({
  progress,
  size = 24,
  strokeWidth = 2,
  color = "#6366f1",
}: CircularProgressProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const isOverHalf = clampedProgress > 50;
  const firstHalfRotation = -90 + (Math.min(clampedProgress, 50) / 50) * 180;
  const secondHalfRotation = 90 + ((clampedProgress - 50) / 50) * 180;

  return (
    <View style={{ width: size, height: size }}>
      {/* Background circle */}
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: "rgba(255, 255, 255, 0.2)",
        }}
      />
      {/* First half of progress */}
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: "transparent",
          borderTopColor: color,
          borderRightColor: clampedProgress > 0 ? color : "transparent",
          transform: [{ rotate: `${firstHalfRotation}deg` }],
        }}
      />
      {/* Second half of progress (only if over 50%) */}
      {isOverHalf && (
        <View
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: "transparent",
            borderBottomColor: color,
            borderRightColor: clampedProgress >= 50 ? color : "transparent",
            transform: [{ rotate: `${secondHalfRotation}deg` }],
          }}
        />
      )}
    </View>
  );
}
