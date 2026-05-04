import React, { useState, useMemo, useCallback } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Snackbar } from "react-native-paper";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  useManga,
  useChapters,
  useAllChapterProgress,
  useMarkChapterComplete,
  useMarkChapterIncomplete,
  useCategories,
  useMangaCategories,
  useAddMangaToCategory,
  useRemoveMangaFromCategory,
  useDeleteManga,
  useCheckMangaUpdates,
  useDownloadAllChapters,
  useSources,
} from "@/api/hooks";
import { apiClient } from "@/api/client";
import type { Chapter, Category, ReadingProgress } from "@/types";
import {
  ChapterItem,
  ChapterMenu,
  MangaHeader,
  DeleteMangaDialog,
  MangaDetailSkeleton,
} from "@/components/manga";

/**
 * Build a map of chapter ID -> reading progress for O(1) lookup
 */
function buildProgressMap(
  allChapterProgress: ReadingProgress[] | undefined,
): Record<string, ReadingProgress> {
  if (!allChapterProgress) {
    return {};
  }

  return allChapterProgress.reduce(
    (acc, progress) => {
      if (progress.chapterId) {
        acc[progress.chapterId] = progress;
      }
      return acc;
    },
    {} as Record<string, ReadingProgress>,
  );
}

/**
 * Find the current chapter to continue reading
 * Returns the most recently read chapter with progress, or the first chapter
 */
function findCurrentChapter(
  allChapterProgress: ReadingProgress[] | undefined,
  sortedChapters: Chapter[],
): Chapter | undefined {
  if (!sortedChapters.length) {
    return undefined;
  }

  const latestProgress = allChapterProgress?.[0];
  if (latestProgress?.chapterId) {
    const found = sortedChapters.find((c) => c.id === latestProgress.chapterId);
    if (found) {
      return found;
    }
  }

  return sortedChapters[0];
}

export default function MangaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // UI State
  const [categoryMenuVisible, setCategoryMenuVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [chapterMenuVisible, setChapterMenuVisible] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  // Data Fetching - ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const { data: manga, isLoading: mangaLoading } = useManga(id);
  const { data: chapters = [], isLoading: chaptersLoading } = useChapters(id);
  const { data: allChapterProgress } = useAllChapterProgress(id);
  const { data: allCategories } = useCategories();
  const { data: mangaCategories } = useMangaCategories(id);
  const { data: sources = [] } = useSources();

  // UI State
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  // Mutations
  const markChapterComplete = useMarkChapterComplete();
  const markChapterIncomplete = useMarkChapterIncomplete();
  const addToCategory = useAddMangaToCategory();
  const removeFromCategory = useRemoveMangaFromCategory();
  const deleteManga = useDeleteManga();
  const checkMangaUpdates = useCheckMangaUpdates();
  const downloadAllChapters = useDownloadAllChapters();

  const showSnackbar = useCallback((message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  }, []);

  const handleCheckUpdates = useCallback(() => {
    checkMangaUpdates.mutate(id, {
      onSuccess: (data) => {
        if (data.newChaptersFound > 0) {
          showSnackbar(`Found ${data.newChaptersFound} new chapter${data.newChaptersFound > 1 ? "s" : ""}! Queued for download.`);
        } else {
          showSnackbar("No new chapters found.");
        }
      },
      onError: (err) => {
        showSnackbar(`Error: ${err.message}`);
      },
    });
  }, [id, checkMangaUpdates, showSnackbar]);

  const handleDownloadAll = useCallback(() => {
    downloadAllChapters.mutate(id, {
      onSuccess: (data) => {
        if (data.chaptersQueued > 0) {
          showSnackbar(`Queued ${data.chaptersQueued} chapter${data.chaptersQueued > 1 ? "s" : ""} for download.`);
        } else {
          showSnackbar("No pending chapters to download.");
        }
      },
      onError: (err) => {
        showSnackbar(`Error: ${err.message}`);
      },
    });
  }, [id, downloadAllChapters, showSnackbar]);

  // Derived State - Memoized to prevent unnecessary re-renders
  const sortedChapters = useMemo(() => {
    return [...chapters].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [chapters]);

  const sourceName = useMemo(
    () => sources.find((s) => s.id === manga?.sourceId)?.name || manga?.sourceId,
    [sources, manga?.sourceId],
  );

  const isSourceOnline = useMemo(
    () => sources.some((s) => s.id === manga?.sourceId),
    [sources, manga?.sourceId],
  );

  const hasPendingChapters = useMemo(
    () => sortedChapters.some((c) => c.importStatus === "pending"),
    [sortedChapters],
  );

  const progressMap = useMemo(
    () => buildProgressMap(allChapterProgress),
    [allChapterProgress],
  );

  const currentChapter = useMemo(
    () => findCurrentChapter(allChapterProgress, sortedChapters),
    [allChapterProgress, sortedChapters],
  );

  const coverUrl = useMemo(
    () => (manga ? apiClient.getCoverUrl(manga.coverImage) : undefined),
    [manga],
  );

  // Event Handlers - Stable callbacks
  const handleContinueReading = useCallback(() => {
    if (currentChapter && manga) {
      router.push(`/reader/${manga.id}/${currentChapter.id}`);
    }
  }, [currentChapter, manga]);

  const handleChapterPress = useCallback(
    (chapterId: string) => {
      if (manga) {
        router.push(`/reader/${manga.id}/${chapterId}`);
      }
    },
    [manga],
  );

  const handleChapterLongPress = useCallback((chapter: Chapter) => {
    setSelectedChapter(chapter);
    setChapterMenuVisible(true);
  }, []);

  const handleMarkRead = useCallback(() => {
    if (selectedChapter) {
      markChapterComplete.mutate({
        mangaId: id,
        chapterId: selectedChapter.id,
      });
    }
    setChapterMenuVisible(false);
  }, [selectedChapter, id, markChapterComplete]);

  const handleMarkUnread = useCallback(() => {
    if (selectedChapter) {
      markChapterIncomplete.mutate({
        mangaId: id,
        chapterId: selectedChapter.id,
      });
    }
    setChapterMenuVisible(false);
  }, [selectedChapter, id, markChapterIncomplete]);

  const handleMarkPreviousRead = useCallback(() => {
    if (selectedChapter) {
      markChapterComplete.mutate({
        mangaId: id,
        chapterId: selectedChapter.id,
        markPrevious: true,
      });
    }
    setChapterMenuVisible(false);
  }, [selectedChapter, id, markChapterComplete]);

  const handleMarkFollowingUnread = useCallback(() => {
    if (selectedChapter) {
      markChapterIncomplete.mutate({
        mangaId: id,
        chapterId: selectedChapter.id,
        markFollowing: true,
      });
    }
    setChapterMenuVisible(false);
  }, [selectedChapter, id, markChapterIncomplete]);

  const handleDelete = useCallback(async () => {
    await deleteManga.mutateAsync(id);
    setDeleteDialogVisible(false);
    router.back();
  }, [id, deleteManga]);

  const handleCategoryToggle = useCallback(
    (category: Category) => {
      const isInCategory = mangaCategories?.some((c) => c.id === category.id);
      if (isInCategory) {
        removeFromCategory.mutate({ mangaId: id, categoryId: category.id });
      } else {
        addToCategory.mutate({ mangaId: id, categoryId: category.id });
      }
    },
    [mangaCategories, id, removeFromCategory, addToCategory],
  );

  const handleCategoryMenuDismiss = useCallback(
    () => setCategoryMenuVisible(false),
    [],
  );
  const handleCategoryMenuOpen = useCallback(
    () => setCategoryMenuVisible(true),
    [],
  );
  const handleDeletePress = useCallback(() => setDeleteDialogVisible(true), []);
  const handleDeleteDismiss = useCallback(
    () => setDeleteDialogVisible(false),
    [],
  );
  const handleChapterMenuDismiss = useCallback(
    () => setChapterMenuVisible(false),
    [],
  );

  // Render Helpers - Stable references for FlatList
  const renderHeader = useCallback(
    () =>
      manga ? (
        <MangaHeader
          manga={manga}
          sourceName={sourceName}
          isSourceOnline={isSourceOnline}
          coverUrl={coverUrl}
          sortedChapters={sortedChapters}
          currentChapter={currentChapter}
          progressMap={progressMap}
          allCategories={allCategories}
          mangaCategories={mangaCategories}
          categoryMenuVisible={categoryMenuVisible}
          onCategoryMenuDismiss={handleCategoryMenuDismiss}
          onCategoryMenuOpen={handleCategoryMenuOpen}
          onCategoryToggle={handleCategoryToggle}
          onContinueReading={handleContinueReading}
          onDeletePress={handleDeletePress}
          onCheckUpdates={handleCheckUpdates}
          onDownloadAll={handleDownloadAll}
          hasPendingChapters={hasPendingChapters}
          isCheckingUpdates={checkMangaUpdates.isPending}
          isDownloadingAll={downloadAllChapters.isPending}
        />
      ) : null,
    [
      manga,
      sourceName,
      isSourceOnline,
      coverUrl,
      sortedChapters,
      currentChapter,
      progressMap,
      allCategories,
      mangaCategories,
      categoryMenuVisible,
      handleCategoryMenuDismiss,
      handleCategoryMenuOpen,
      handleCategoryToggle,
      handleContinueReading,
      handleDeletePress,
      handleCheckUpdates,
      handleDownloadAll,
      hasPendingChapters,
      checkMangaUpdates.isPending,
      downloadAllChapters.isPending,
    ],
  );

  const renderChapterItem = useCallback(
    ({ item: chapter }: { item: Chapter }) => {
      const progress = progressMap[chapter.id];
      const isCurrent = chapter.id === currentChapter?.id;

      return (
        <ChapterItem
          chapter={chapter}
          progress={progress}
          isCurrent={isCurrent}
          onPress={handleChapterPress}
          onLongPress={handleChapterLongPress}
        />
      );
    },
    [progressMap, currentChapter, handleChapterPress, handleChapterLongPress],
  );

  const keyExtractor = useCallback((item: Chapter) => item.id, []);

  // Loading State - Show skeleton while manga loads
  if (mangaLoading || !manga) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <MangaDetailSkeleton />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // Chapters Loading State - Show header with loading indicator
  if (chaptersLoading) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <FlatList
            data={[]}
            ListHeaderComponent={renderHeader}
            renderItem={() => null}
            contentContainerStyle={styles.flatListContent}
          />
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // Empty Chapters State
  if (sortedChapters.length === 0) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <FlatList
            data={[]}
            ListHeaderComponent={renderHeader}
            renderItem={() => null}
            contentContainerStyle={styles.flatListContent}
          />
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // Main Content - Fixed FlatList configuration
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <FlatList
          data={sortedChapters}
          keyExtractor={keyExtractor}
          ListHeaderComponent={renderHeader}
          renderItem={renderChapterItem}
          // FIXED: Removed getItemLayout - let FlatList measure items
          // FIXED: Removed key={id} - prevents destructive remounts
          // FIXED: Added extraData to trigger re-renders when current chapter changes
          extraData={currentChapter?.id}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={10}
          removeClippedSubviews={false}
          contentContainerStyle={styles.flatListContent}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
          }}
        />

        <DeleteMangaDialog
          visible={deleteDialogVisible}
          onDismiss={handleDeleteDismiss}
          onConfirm={handleDelete}
          mangaTitle={manga.title}
        />

        <ChapterMenu
          visible={chapterMenuVisible}
          onDismiss={handleChapterMenuDismiss}
          chapter={selectedChapter}
          progress={
            selectedChapter ? progressMap[selectedChapter.id] : undefined
          }
          onMarkRead={handleMarkRead}
          onMarkUnread={handleMarkUnread}
          onMarkPreviousRead={handleMarkPreviousRead}
          onMarkFollowingUnread={handleMarkFollowingUnread}
        />

        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={3000}
          style={styles.snackbar}
        >
          {snackbarMessage}
        </Snackbar>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  flatListContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(26, 26, 26, 0.8)",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  snackbar: {
    backgroundColor: "#333",
  },
});
