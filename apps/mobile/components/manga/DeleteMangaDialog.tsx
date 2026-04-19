import React from "react";
import { StyleSheet } from "react-native";
import { Portal, Dialog, Button, Text } from "react-native-paper";

interface DeleteMangaDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
  mangaTitle: string;
}

const DIALOG_BACKGROUND = "#252525";
const TEXT_COLOR = "#fff";
const CONTENT_COLOR = "#d1d5db";
const CANCEL_COLOR = "#d1d5db";
const DELETE_COLOR = "#ef4444";

/**
 * Delete confirmation dialog for manga
 */
export function DeleteMangaDialog({
  visible,
  onDismiss,
  onConfirm,
  mangaTitle,
}: DeleteMangaDialogProps) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>Delete Manga</Dialog.Title>
        <Dialog.Content>
          <Text style={styles.content}>
            Are you sure you want to delete "{mangaTitle}"? This action cannot
            be undone.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} textColor={CANCEL_COLOR}>
            Cancel
          </Button>
          <Button onPress={onConfirm} textColor={DELETE_COLOR}>
            Delete
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
  content: {
    color: CONTENT_COLOR,
  },
});
