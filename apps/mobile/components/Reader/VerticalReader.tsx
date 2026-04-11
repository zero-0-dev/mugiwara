import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  ScrollView,
  Dimensions,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { apiClient } from "@/api/client";

const { width, height } = Dimensions.get("window");

interface VerticalReaderProps {
  mangaId: string;
  chapterId: string;
  initialPage: number;
  totalPages: number;
  onPageChange: (page: number, total: number) => void;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  onTap: () => void;
}

export function VerticalReader({
  mangaId,
  chapterId,
  initialPage,
  totalPages,
  onPageChange,
  onPrevChapter,
  onNextChapter,
  onTap,
}: VerticalReaderProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const pageRefs = useRef<(View | null)[]>([]);

  const pages = Array.from({ length: totalPages }, (_, i) => i);

  const handleTap = (event: any) => {
    const { locationY } = event.nativeEvent;
    const tapZone = height / 3;

    if (locationY < tapZone) {
      // Tap top - scroll up
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, (currentPage - 1) * height * 0.8),
        animated: true,
      });
    } else if (locationY > height - tapZone) {
      // Tap bottom - scroll down
      scrollViewRef.current?.scrollTo({
        y: (currentPage + 1) * height * 0.8,
        animated: true,
      });
    } else {
      // Tap center - toggle controls
      onTap();
    }
  };

  const handleScroll = useCallback(
    (event: any) => {
      const scrollY = event.nativeEvent.contentOffset.y;
      const pageHeight = height * 0.8;
      const newPage = Math.round(scrollY / pageHeight);

      if (newPage !== currentPage && newPage >= 0 && newPage < totalPages) {
        setCurrentPage(newPage);
        onPageChange(newPage + 1, totalPages);
      }

      // Check if reached end
      const contentHeight = event.nativeEvent.contentSize.height;
      const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;

      if (scrollY + scrollViewHeight >= contentHeight - 100) {
        // Near end of chapter
        if (currentPage === totalPages - 1) {
          onNextChapter?.();
        }
      }
    },
    [currentPage, totalPages, onPageChange, onNextChapter],
  );

  // Scroll to initial page on mount
  useEffect(() => {
    if (initialPage > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: initialPage * height * 0.8,
          animated: false,
        });
      }, 100);
    }
  }, [initialPage]);

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.container}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          onScroll={handleScroll}
          scrollEventThrottle={200}
          showsVerticalScrollIndicator={false}
        >
          {pages.map((index) => {
            const pageUrl = apiClient.getPageUrl(mangaId, chapterId, index);
            return (
              <View
                key={index}
                ref={(ref) => {
                  pageRefs.current[index] = ref;
                }}
                style={styles.pageContainer}
              >
                <Image
                  source={{ uri: pageUrl }}
                  style={styles.image}
                  contentFit="contain"
                  transition={200}
                />
              </View>
            );
          })}
        </ScrollView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingVertical: 20,
  },
  pageContainer: {
    width,
    minHeight: height * 0.8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  image: {
    width: width * 0.95,
    height: height * 0.8,
  },
});
