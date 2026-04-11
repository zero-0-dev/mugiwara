import { useState, useCallback, useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, IconButton, Menu, Text } from "react-native-paper";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useManga,
  useChapters,
  useProgress,
  useUpdateProgress,
  useReadingMode,
  useSetReadingMode,
} from "@/api/hooks";
import { RTLReader } from "@/components/Reader/RTLReader";
import { LTRReader } from "@/components/Reader/LTRReader";
import { VerticalReader } from "@/components/Reader/VerticalReader";
import { ReadingMode } from "@/types";

const { width, height } = Dimensions.get("window");

export default function ReaderScreen() {
  const { mangaId, chapterId } = useLocalSearchParams<{
    mangaId: string;
    chapterId: string;
  }>();

  const insets = useSafeAreaInsets();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [modeMenuVisible, setModeMenuVisible] = useState(false);

  const { data: manga } = useManga(mangaId);
  const { data: chapters } = useChapters(mangaId);
  const { data: progress } = useProgress(mangaId);
  const { data: savedReadingMode } = useReadingMode(mangaId);
  const updateProgress = useUpdateProgress();
  const setReadingMode = useSetReadingMode();

  const [readingMode, setReadingModeState] = useState<ReadingMode>("rtl");

  // Determine reading mode
  useEffect(() => {
    if (savedReadingMode) {
      setReadingModeState(savedReadingMode);
    } else if (manga?.mediaType) {
      const mediaTypeMode: Record<string, ReadingMode> = {
        manga: "rtl",
        manhwa: "vertical",
        manhua: "vertical",
        webtoon: "vertical",
      };
      setReadingModeState(mediaTypeMode[manga.mediaType] || "rtl");
    }
  }, [savedReadingMode, manga?.mediaType]);

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
      updateProgress.mutate({
        mangaId,
        chapterId,
        pageNumber,
        totalPages,
        isCompleted: pageNumber === totalPages,
      });
    },
    [mangaId, chapterId, updateProgress],
  );

  const handlePrevChapter = useCallback(() => {
    if (prevChapter) {
      router.replace(`/reader/${mangaId}/${prevChapter.id}`);
    }
  }, [mangaId, prevChapter]);

  const handleNextChapter = useCallback(() => {
    if (nextChapter) {
      router.replace(`/reader/${mangaId}/${nextChapter.id}`);
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

  if (!currentChapter) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const renderReader = () => {
    const readerProps = {
      mangaId,
      chapterId,
      initialPage: progress?.chapterId === chapterId ? progress.pageNumber : 0,
      totalPages: currentChapter.pagesCount,
      onPageChange: handlePageChange,
      onPrevChapter: prevChapter ? handlePrevChapter : undefined,
      onNextChapter: nextChapter ? handleNextChapter : undefined,
      onTap: toggleControls,
    };

    switch (readingMode) {
      case "ltr":
        return <LTRReader {...readerProps} />;
      case "vertical":
        return <VerticalReader {...readerProps} />;
      case "rtl":
      default:
        return <RTLReader {...readerProps} />;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={!controlsVisible} />

      {/* Top Controls */}
      {controlsVisible && (
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
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
      )}

      {/* Reader */}
      <View style={styles.readerContainer}>{renderReader()}</View>

      {/* Bottom Controls */}
      {controlsVisible && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
          <IconButton
            icon="chevron-left"
            onPress={handlePrevChapter}
            disabled={!prevChapter}
            iconColor={prevChapter ? "#fff" : "#6b7280"}
            size={28}
          />
          <Text style={styles.pageInfo}>
            {currentChapter.chapterId} / {sortedChapters.length} chapters
          </Text>
          <IconButton
            icon="chevron-right"
            onPress={handleNextChapter}
            disabled={!nextChapter}
            iconColor={nextChapter ? "#fff" : "#6b7280"}
            size={28}
          />
        </View>
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
