import { useState, useEffect } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Appbar,
  Text,
  ProgressBar,
  Button,
  ActivityIndicator,
  Snackbar,
} from "react-native-paper";
import { useImportProgress, useCancelImport } from "@/api/hooks";

export default function AddMangaImportScreen() {
  const { mangaId, title } = useLocalSearchParams<{
    mangaId: string;
    title?: string;
  }>();
  const [phase, setPhase] = useState<"importing" | "success" | "cancelled">(
    "importing",
  );
  const [error, setError] = useState<string | null>(null);

  const { data: progress, isLoading } = useImportProgress(mangaId || "");
  const cancelImport = useCancelImport();

  useEffect(() => {
    if (progress?.isComplete && phase === "importing") {
      setPhase("success");
    }
  }, [progress?.isComplete, phase]);

  const handleCancel = async () => {
    try {
      await cancelImport.mutateAsync(mangaId || "");
      setPhase("cancelled");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to cancel import",
      );
    }
  };

  if (!mangaId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>No import in progress</Text>
        <Button
          onPress={() => router.back()}
          mode="contained"
          buttonColor="#6366f1"
          style={{ marginTop: 16 }}
        >
          Go Back
        </Button>
      </View>
    );
  }

  if (isLoading && !progress) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const completedChapters = progress?.completedChapters ?? 0;
  const totalChapters = progress?.totalChapters ?? 0;
  const erroredChapters = progress?.erroredChapters ?? 0;
  const overallProgress = progress?.overallProgress ?? 0;

  if (phase === "success" || phase === "cancelled") {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.successIconContainer}>
          <Text style={styles.successIcon}>
            {phase === "success" ? "✓" : "✗"}
          </Text>
        </View>
        <Text style={styles.successTitle}>
          {phase === "success" ? "Import Complete!" : "Import Cancelled"}
        </Text>
        <Text style={styles.successSubtitle}>
          {completedChapters} chapter{completedChapters !== 1 ? "s" : ""}
          {erroredChapters > 0
            ? ` (${erroredChapters} error${erroredChapters !== 1 ? "s" : ""})`
            : ""}{" "}
          imported
        </Text>

        <Button
          mode="contained"
          onPress={() => {
            router.dismissAll();
          }}
          buttonColor="#6366f1"
          style={styles.successButton}
        >
          View in Library
        </Button>
        <Button
          mode="outlined"
          onPress={() => {
            router.replace("/add-manga" as any);
          }}
          style={styles.successButton}
          textColor="#6366f1"
        >
          Add Another
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title={`Importing ${title || "Manga"}`} />
        <Appbar.Action
          icon="close"
          onPress={() => router.back()}
        />
      </Appbar.Header>

      <View style={styles.progressSection}>
        <ProgressBar
          progress={overallProgress / 100}
          color="#6366f1"
          style={styles.progressBar}
        />
        <Text style={styles.progressText}>
          {Math.round(overallProgress)}% complete
        </Text>
        <Text style={styles.progressDetail}>
          {completedChapters} / {totalChapters} chapters
        </Text>
      </View>

      <FlatList
        data={progress?.chapters || []}
        renderItem={({ item }) => {
          const statusConfig: Record<string, { icon: string; text: string }> =
            {
              complete: { icon: "✓", text: "Complete" },
              downloading: {
                icon: "⏳",
                text: item.totalPages
                  ? `${item.completedPages || 0}/${item.totalPages} pages`
                  : "Downloading...",
              },
              queued: { icon: "○", text: "Queued" },
              error: {
                icon: "✗",
                text: item.errorMessage || "Error",
              },
            };

          const config = statusConfig[item.status] || {
            icon: "○",
            text: item.status,
          };

          return (
            <View style={styles.chapterRow}>
              <Text style={styles.chapterStatusIcon}>{config.icon}</Text>
              <View style={styles.chapterInfo}>
                <Text style={styles.chapterText} numberOfLines={1}>
                  Ch. {item.sortOrder}
                  {item.title ? ` - ${item.title}` : ""}
                </Text>
                <Text
                  style={[
                    styles.chapterStatus,
                    item.status === "error" && styles.errorText,
                  ]}
                >
                  {config.text}
                </Text>
              </View>
            </View>
          );
        }}
        keyExtractor={(item) => item.chapterId}
        style={styles.chapterList}
        contentContainerStyle={styles.chapterListContent}
      />

      <View style={styles.cancelSection}>
        <Button
          mode="outlined"
          onPress={handleCancel}
          loading={cancelImport.isPending}
          disabled={cancelImport.isPending}
          textColor="#ef4444"
        >
          Cancel Remaining
        </Button>
      </View>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError(null)}
        action={{ label: "Dismiss", onPress: () => setError(null) }}
      >
        {error}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  header: {
    backgroundColor: "#1a1a1a",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  progressSection: {
    padding: 24,
    alignItems: "center",
  },
  progressBar: {
    width: "100%",
    height: 12,
    borderRadius: 6,
    backgroundColor: "#333",
  },
  progressText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 12,
  },
  progressDetail: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 4,
  },
  chapterList: {
    flex: 1,
  },
  chapterListContent: {
    paddingBottom: 80,
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
  },
  chapterStatusIcon: {
    fontSize: 16,
    width: 24,
    textAlign: "center",
    color: "#d1d5db",
  },
  chapterInfo: {
    flex: 1,
    marginLeft: 8,
  },
  chapterText: {
    color: "#fff",
    fontSize: 14,
  },
  chapterStatus: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 2,
  },
  errorText: {
    color: "#ef4444",
  },
  cancelSection: {
    padding: 16,
    alignItems: "center",
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#252525",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  successIcon: {
    fontSize: 36,
    color: "#6366f1",
  },
  successTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },
  successSubtitle: {
    color: "#6b7280",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 32,
  },
  successButton: {
    width: "80%",
    marginBottom: 12,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 16,
    textAlign: "center",
  },
});
