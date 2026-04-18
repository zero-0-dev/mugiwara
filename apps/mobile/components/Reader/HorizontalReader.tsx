import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  FlatList,
  Dimensions,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
} from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/api/client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");

// Special item types
const PREV_CHAPTER_ITEM = -1;
const NEXT_CHAPTER_ITEM = -2;

interface HorizontalReaderProps {
  mangaId: string;
  chapterId: string;
  direction: "ltr" | "rtl";
  initialPage: number;
  totalPages: number;
  onPageChange: (page: number, total: number) => void;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  onToggleControls?: () => void;
  controlsVisible?: boolean;
}

export function HorizontalReader({
  mangaId,
  chapterId,
  direction,
  initialPage,
  totalPages,
  onPageChange,
  onPrevChapter,
  onNextChapter,
  onToggleControls,
  controlsVisible = true,
}: HorizontalReaderProps) {
  const [currentIndex, setCurrentIndex] = useState(initialPage);
  const [hasTriggeredChapterChange, setHasTriggeredChapterChange] =
    useState(false);
  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const isRTL = direction === "rtl";

  // Build the pages array with chapter transition items
  const basePages = Array.from({ length: totalPages }, (_, i) => i);

  // Add transition items
  const pagesWithTransitions = [
    ...(onPrevChapter ? [PREV_CHAPTER_ITEM] : []),
    ...basePages,
    ...(onNextChapter ? [NEXT_CHAPTER_ITEM] : []),
  ];

  // For RTL, we invert the list
  const displayPages = isRTL
    ? [...pagesWithTransitions].reverse()
    : pagesWithTransitions;

  const getActualIndexFromDisplay = (displayIndex: number): number => {
    if (isRTL) {
      return pagesWithTransitions.length - 1 - displayIndex;
    }
    return displayIndex;
  };

  const getDisplayIndexFromActual = (actualIndex: number): number => {
    if (isRTL) {
      return pagesWithTransitions.length - 1 - actualIndex;
    }
    return actualIndex;
  };

  const handleScroll = useCallback(
    (event: any) => {
      const scrollX = event.nativeEvent.contentOffset.x;
      const pageIndex = Math.round(scrollX / width);
      const actualIndex = getActualIndexFromDisplay(pageIndex);

      if (
        actualIndex !== currentIndex &&
        actualIndex >= 0 &&
        actualIndex < pagesWithTransitions.length
      ) {
        setCurrentIndex(actualIndex);

        // Only report page changes for actual content pages (not transition items)
        const item = pagesWithTransitions[actualIndex];
        if (item !== PREV_CHAPTER_ITEM && item !== NEXT_CHAPTER_ITEM) {
          onPageChange(item + 1, totalPages);
        }
      }
    },
    [
      currentIndex,
      pagesWithTransitions.length,
      onPageChange,
      isRTL,
      totalPages,
    ],
  );

  const handleMomentumScrollEnd = useCallback(
    (event: any) => {
      const scrollX = event.nativeEvent.contentOffset.x;
      const pageIndex = Math.round(scrollX / width);
      const actualIndex = getActualIndexFromDisplay(pageIndex);

      const item = pagesWithTransitions[actualIndex];

      // Check if we're on a transition item and haven't triggered yet
      if (!hasTriggeredChapterChange) {
        if (item === PREV_CHAPTER_ITEM) {
          setHasTriggeredChapterChange(true);
          onPrevChapter?.();
        } else if (item === NEXT_CHAPTER_ITEM) {
          setHasTriggeredChapterChange(true);
          onNextChapter?.();
        }
      }
    },
    [
      pagesWithTransitions,
      onPrevChapter,
      onNextChapter,
      hasTriggeredChapterChange,
      isRTL,
    ],
  );

  // Reset trigger flag when chapter changes
  useEffect(() => {
    setHasTriggeredChapterChange(false);
  }, [chapterId]);

  const renderItem = ({ item }: { item: number }) => {
    // Handle transition items
    if (item === PREV_CHAPTER_ITEM) {
      return (
        <View style={styles.transitionContainer}>
          <MaterialCommunityIcons
            name="book-arrow-left"
            size={48}
            color="#666"
          />
          <Text style={styles.transitionText}>Previous Chapter</Text>
          <Text style={styles.transitionHint}>Swipe to continue</Text>
        </View>
      );
    }

    if (item === NEXT_CHAPTER_ITEM) {
      return (
        <View style={styles.transitionContainer}>
          <MaterialCommunityIcons
            name="book-arrow-right"
            size={48}
            color="#666"
          />
          <Text style={styles.transitionText}>Next Chapter</Text>
          <Text style={styles.transitionHint}>Swipe to continue</Text>
        </View>
      );
    }

    // Regular page
    const pageUrl = apiClient.getPageUrl(mangaId, chapterId, item + 1);
    return (
      <View style={styles.pageContainer}>
        <Image
          source={{ uri: pageUrl }}
          style={styles.image}
          contentFit="contain"
          transition={200}
        />
      </View>
    );
  };

  // Calculate initial scroll index
  // For LTR: prev item at 0, content pages at 1..N, next item at N+1
  // For RTL: we need to account for the reversed array
  const getInitialScrollIndex = () => {
    const contentStartIndex = onPrevChapter ? 1 : 0;
    const initialIndex = contentStartIndex + initialPage;
    return getDisplayIndexFromActual(initialIndex);
  };

  // Calculate current page number for display (excluding transition items)
  const getDisplayPageNumber = () => {
    const currentItem = pagesWithTransitions[currentIndex];
    if (currentItem === PREV_CHAPTER_ITEM) {
      return "Prev";
    }
    if (currentItem === NEXT_CHAPTER_ITEM) {
      return "Next";
    }
    return currentItem + 1;
  };

  const displayPageNumber = getDisplayPageNumber();

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={displayPages}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item}-${index}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
        initialScrollIndex={getInitialScrollIndex()}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
      />
      {/* Page count footer */}
      <TouchableWithoutFeedback onPress={onToggleControls}>
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 8,
              opacity: controlsVisible ? 1 : 0,
            },
          ]}
        >
          <Text style={styles.pageInfo}>
            Page{" "}
            {typeof displayPageNumber === "number"
              ? `${displayPageNumber} / ${totalPages}`
              : displayPageNumber}
          </Text>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  pageContainer: {
    width,
    height,
    justifyContent: "center",
    alignItems: "center",
  },
  transitionContainer: {
    width,
    height,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111",
  },
  transitionText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  transitionHint: {
    color: "#666",
    fontSize: 14,
    marginTop: 8,
  },
  image: {
    width,
    height: height * 0.9,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    paddingVertical: 12,
    alignItems: "center",
  },
  pageInfo: {
    color: "#fff",
    fontSize: 14,
  },
});
