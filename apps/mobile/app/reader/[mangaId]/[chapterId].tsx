import { useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, IconButton, Menu, Text } from "react-native-paper";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useManga,
  useChapters,
  useChapterProgress,
  useUpdateChapterProgress,
  useReadingMode,
  useSetReadingMode,
} from "@/api/hooks";
import { HorizontalReader } from "@/components/Reader/HorizontalReader";
import { VerticalReader } from "@/components/Reader/VerticalReader";
import { ReadingMode } from "@/types";

const { width, height } = Dimensions.get("window");

export const ScreenOptions = {
  headerShown: false,
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
  animation: "none",
  contentStyle: { backgroundColor: "#000" },
};

export default function ReaderScreen() {
  const {
    mangaId,
    chapterId,
    initialPage: initialPageParam,
  } = useLocalSearchParams<{
    mangaId: string;
    chapterId: string;
    initialPage?: string;
  }>();

  const insets = useSafeAreaInsets();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [modeMenuVisible, setModeMenuVisible] = useState(false);

  const { data: manga } = useManga(mangaId);
  const { data: chapters } = useChapters(mangaId);
  // Use chapter-specific progress instead of manga-level progress
  const { data: chapterProgress, isLoading: isProgressLoading } =
    useChapterProgress(mangaId, chapterId);
  const { data: serverReadingMode } = useReadingMode(mangaId);
  const updateChapterProgress = useUpdateChapterProgress();
  const setReadingMode = useSetReadingMode();

  // Local state for reading mode, initialized from server
  const [readingMode, setReadingModeState] = useState<ReadingMode>("rtl");

  // Update local state when server returns the resolved reading mode
  useEffect(() => {
    if (serverReadingMode) {
      setReadingModeState(serverReadingMode);
    }
  }, [serverReadingMode]);

  const sortedChapters = chapters
    ? [...chapters].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const currentChapterIndex = sortedChapters.findIndex(
    (c) => c.id === chapterId,
  );
  const currentChapter = sortedChapters[currentChapterIndex];
  const prevChapter = sortedChapters[currentChapterIndex - 1];
  const nextChapter = sortedChapters[currentChapterIndex + 1];

  const handlePageChange = useCallback(
    (pageNumber: number, totalPages: number) => {
      updateChapterProgress.mutate({
        mangaId,
        chapterId,
        pageNumber,
        totalPages,
        isCompleted: pageNumber === totalPages,
      });
    },
    [mangaId, chapterId, updateChapterProgress],
  );

  const handlePrevChapter = useCallback(() => {
    if (prevChapter) {
      // Navigate to previous chapter, start at last page
      router.replace(
        `/reader/${mangaId}/${prevChapter.id}?initialPage=${prevChapter.pagesCount - 1}`,
      );
    }
  }, [mangaId, prevChapter]);

  const handleNextChapter = useCallback(() => {
    if (nextChapter) {
      // Navigate to next chapter, start at first page
      router.replace(`/reader/${mangaId}/${nextChapter.id}?initialPage=0`);
    }
  }, [mangaId, nextChapter]);

  const handleModeChange = (mode: ReadingMode) => {
    setReadingModeState(mode);
    setReadingMode.mutate({ mangaId, mode });
    setModeMenuVisible(false);
  };

  const toggleControls = () => {
    setControlsVisible(!controlsVisible);
  };

  const handleBack = () => {
    router.back();
  };

  // Wait for chapter data and progress to load before rendering
  // This prevents race condition where reader initializes with wrong page
  if (!currentChapter || isProgressLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // Get initial page from route params or from chapter-specific progress
  const pageFromParams = initialPageParam
    ? parseInt(initialPageParam, 10)
    : undefined;
  const savedProgressPage = chapterProgress?.pageNumber || 1;
  const initialPage =
    pageFromParams !== undefined
      ? pageFromParams
      : savedProgressPage > 1
        ? savedProgressPage - 1
        : 0; // Convert to 0-based

  const renderReader = () => {
    const readerProps = {
      mangaId,
      chapterId,
      initialPage,
      totalPages: currentChapter.pagesCount,
      onPageChange: handlePageChange,
      onPrevChapter: prevChapter ? handlePrevChapter : undefined,
      onNextChapter: nextChapter ? handleNextChapter : undefined,
    };

    if (readingMode === "vertical") {
      return <VerticalReader {...readerProps} />;
    } else {
      return (
        <HorizontalReader
          {...readerProps}
          direction={readingMode}
          controlsVisible={controlsVisible}
          onToggleControls={toggleControls}
        />
      );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={!controlsVisible} />

      {/* Top Controls */}
      <TouchableWithoutFeedback onPress={toggleControls}>
        <View
          style={[
            styles.topBar,
            { paddingTop: insets.top, opacity: controlsVisible ? 1 : 0 },
          ]}
        >
          <IconButton
            icon="arrow-left"
            onPress={handleBack}
            iconColor="#fff"
            size={24}
          />
          <Text style={styles.chapterTitle} numberOfLines={1}>
            {manga?.title} - Chapter {currentChapter.chapterId}
          </Text>
          <Menu
            visible={modeMenuVisible}
            onDismiss={() => setModeMenuVisible(false)}
            anchor={
              <IconButton
                icon={
                  readingMode === "rtl"
                    ? "book-arrow-left"
                    : readingMode === "ltr"
                      ? "book-arrow-right"
                      : "swap-vertical"
                }
                onPress={() => setModeMenuVisible(true)}
                iconColor="#fff"
                size={24}
              />
            }
          >
            <Menu.Item
              onPress={() => handleModeChange("rtl")}
              title="Right to Left (Manga)"
              leadingIcon={readingMode === "rtl" ? "check" : undefined}
            />
            <Menu.Item
              onPress={() => handleModeChange("ltr")}
              title="Left to Right (Comics)"
              leadingIcon={readingMode === "ltr" ? "check" : undefined}
            />
            <Menu.Item
              onPress={() => handleModeChange("vertical")}
              title="Vertical (Webtoon)"
              leadingIcon={readingMode === "vertical" ? "check" : undefined}
            />
          </Menu>
        </View>
      </TouchableWithoutFeedback>

      {/* Reader */}
      <View style={styles.readerContainer}>{renderReader()}</View>

      {/* Bottom Controls - Only for Vertical mode */}
      {readingMode === "vertical" && (
        <TouchableWithoutFeedback onPress={toggleControls}>
          <View
            style={[
              styles.bottomBar,
              {
                paddingBottom: insets.bottom + 8,
                opacity: controlsVisible ? 1 : 0,
              },
            ]}
          >
            <IconButton
              icon="chevron-left"
              onPress={handlePrevChapter}
              disabled={!prevChapter}
              iconColor={prevChapter ? "#fff" : "#6b7280"}
              size={28}
            />
            <Text style={styles.pageInfo}>
              Chapter {currentChapter.chapterId}
            </Text>
            <IconButton
              icon="chevron-right"
              onPress={handleNextChapter}
              disabled={!nextChapter}
              iconColor={nextChapter ? "#fff" : "#6b7280"}
              size={28}
            />
          </View>
        </TouchableWithoutFeedback>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    zIndex: 100,
  },
  chapterTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  readerContainer: {
    flex: 1,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 100,
  },
  pageInfo: {
    color: "#fff",
    fontSize: 14,
  },
});
