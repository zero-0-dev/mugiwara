import React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface CircularProgressProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
}

/**
 * Circular progress indicator component using SVG
 * Renders a circular progress ring that works correctly for all percentages
 */
export function CircularProgress({
  progress,
  size = 24,
  strokeWidth = 2,
  color = "#6366f1",
  backgroundColor = "rgba(255, 255, 255, 0.2)",
}: CircularProgressProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (clampedProgress / 100) * circumference;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="butt"
          transform={`rotate(-90, ${size / 2}, ${size / 2})`}
        />
      </Svg>
    </View>
  );
}
