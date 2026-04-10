import { useState, useRef, useCallback } from "react";
import {
  View,
  FlatList,
  Dimensions,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { apiClient } from "../../api/client";

const { width, height } = Dimensions.get("window");

interface RTLReaderProps {
  mangaId: string;
  chapterId: string;
  initialPage: number;
  totalPages: number;
  onPageChange: (page: number, total: number) => void;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  onTap: () => void;
}

export function RTLReader({
  mangaId,
  chapterId,
  initialPage,
  totalPages,
  onPageChange,
  onPrevChapter,
  onNextChapter,
  onTap,
}: RTLReaderProps) {
  const [currentIndex, setCurrentIndex] = useState(initialPage);
  const flatListRef = useRef<FlatList>(null);

  const pages = Array.from({ length: totalPages }, (_, i) => i);

  const handleTap = (event: any) => {
    const { locationX } = event.nativeEvent;
    const tapZone = width / 3;

    if (locationX < tapZone) {
      // Tap left side - go to next page (RTL: left is next)
      goToPage(currentIndex + 1);
    } else if (locationX > width - tapZone) {
      // Tap right side - go to previous page (RTL: right is previous)
      goToPage(currentIndex - 1);
    } else {
      // Tap center - toggle controls
      onTap();
    }
  };

  const goToPage = (index: number) => {
    if (index < 0) {
      // First page, go to previous chapter
      onPrevChapter?.();
      return;
    }
    if (index >= totalPages) {
      // Last page, go to next chapter
      onNextChapter?.();
      return;
    }
    setCurrentIndex(index);
    flatListRef.current?.scrollToIndex({ index, animated: true });
    onPageChange(index + 1, totalPages);
  };

  const onViewableItemsChanged = useCallback(
    ({
      viewableItems,
    }: {
      viewableItems: Array<{ index?: number | null }>;
      changed: Array<{ index?: number | null }>;
    }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        const newIndex = viewableItems[0].index;
        setCurrentIndex(newIndex);
        onPageChange(newIndex + 1, totalPages);
      }
    },
    [onPageChange, totalPages],
  );

  const renderItem = ({ item: index }: { item: number }) => {
    const pageUrl = apiClient.getPageUrl(mangaId, chapterId, index);
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

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.container}>
        <FlatList
          ref={flatListRef}
          data={pages}
          renderItem={renderItem}
          keyExtractor={(item) => item.toString()}
          horizontal
          inverted // RTL: invert the list
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
          initialScrollIndex={initialPage}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
        />
      </View>
    </TouchableWithoutFeedback>
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
  image: {
    width,
    height: height * 0.9,
  },
});
