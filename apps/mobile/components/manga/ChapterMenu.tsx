import React from "react";
import { View, StyleSheet } from "react-native";
import { Portal, Dialog, Button, Text } from "react-native-paper";
import type { Chapter, ReadingProgress } from "@/types";

interface ChapterMenuProps {
  visible: boolean;
  onDismiss: () => void;
  chapter: Chapter | null;
  progress: ReadingProgress | null | undefined;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onMarkPreviousRead: () => void;
  onMarkFollowingUnread: () => void;
}

const DIALOG_BACKGROUND = "#252525";
const PRIMARY_COLOR = "#6366f1";
const SECONDARY_COLOR = "#4b5563";
const TEXT_COLOR = "#fff";
const SUBTITLE_COLOR = "#9ca3af";
const ACCENT_COLOR = "#d1d5db";
const DANGER_COLOR = "#ef4444";

const COMPLETION_THRESHOLD = 95;

/**
 * Chapter menu dialog for chapter actions
 * Allows users to mark chapters as read/unread and batch operations
 */
export function ChapterMenu({
  visible,
  onDismiss,
  chapter,
  progress,
  onMarkRead,
  onMarkUnread,
  onMarkPreviousRead,
  onMarkFollowingUnread,
}: ChapterMenuProps) {
  if (!chapter) {
    return null;
  }

  const isCompleted =
    progress?.isCompleted ||
    (progress?.percentComplete || 0) >= COMPLETION_THRESHOLD;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>
          Chapter {chapter.chapterId}
        </Dialog.Title>
        <Dialog.Content>
          <Text style={styles.subtitle}>{chapter.title || "No title"}</Text>
          <View style={styles.buttonContainer}>
            {isCompleted ? (
              <Button
                mode="contained"
                onPress={onMarkUnread}
                style={[styles.button]}
                icon="close"
              >
                Mark as Unread
              </Button>
            ) : (
              <Button
                mode="contained"
                onPress={onMarkRead}
                style={[styles.button, { backgroundColor: PRIMARY_COLOR }]}
                icon="check"
              >
                Mark as Read
              </Button>
            )}
            {!isCompleted ? (
              <Button
                mode="outlined"
                onPress={onMarkPreviousRead}
                textColor={ACCENT_COLOR}
                style={styles.button}
                icon="check-all"
              >
                Mark All Previous as Read
              </Button>
            ) : null}
            {isCompleted ? (
              <Button
                mode="outlined"
                onPress={onMarkFollowingUnread}
                textColor={ACCENT_COLOR}
                style={styles.button}
                icon="close-circle-outline"
              >
                Mark All Following as Unread
              </Button>
            ) : null}
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} textColor={ACCENT_COLOR}>
            Cancel
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    backgroundColor: DIALOG_BACKGROUND,
  },
  title: {
    color: TEXT_COLOR,
  },
  subtitle: {
    color: SUBTITLE_COLOR,
    marginBottom: 16,
  },
  buttonContainer: {
    gap: 8,
  },
  button: {
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
});
