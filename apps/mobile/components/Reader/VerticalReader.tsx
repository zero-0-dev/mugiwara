import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  ScrollView,
  Dimensions,
  StyleSheet,
  Animated,
  PanResponder,
} from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/api/client";

const { width, height } = Dimensions.get("window");
const SWIPE_THRESHOLD = width * 0.15;

interface VerticalReaderProps {
  mangaId: string;
  chapterId: string;
  initialPage: number;
  totalPages: number;
  onPageChange: (page: number, total: number) => void;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
}

export function VerticalReader({
  mangaId,
  chapterId,
  initialPage,
  totalPages,
  onPageChange,
  onPrevChapter,
  onNextChapter,
}: VerticalReaderProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const pageRefs = useRef<(View | null)[]>([]);

  // Animated values for arrow indicators
  const leftArrowOpacity = useRef(new Animated.Value(0)).current;
  const rightArrowOpacity = useRef(new Animated.Value(0)).current;
  const leftArrowTranslateX = useRef(new Animated.Value(-20)).current;
  const rightArrowTranslateX = useRef(new Animated.Value(20)).current;

  const pages = Array.from({ length: totalPages }, (_, i) => i);

  const showArrow = (
    opacity: Animated.Value,
    translateX: Animated.Value,
    toValue: number,
  ) => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.spring(translateX, {
        toValue,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hideArrow = (opacity: Animated.Value, translateX: Animated.Value) => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal movements
        return (
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          Math.abs(gestureState.dx) > 5
        );
      },
      onPanResponderMove: (_, gestureState) => {
        const dx = gestureState.dx;

        // Show appropriate arrow based on swipe direction and current page
        if (dx > 0 && currentPage === 0 && onPrevChapter) {
          // Swiping right on first page - show left arrow
          const progress = Math.min(dx / SWIPE_THRESHOLD, 1);
          leftArrowOpacity.setValue(progress);
          leftArrowTranslateX.setValue(-20 + progress * 20);
        } else if (dx < 0 && currentPage === totalPages - 1 && onNextChapter) {
          // Swiping left on last page - show right arrow
          const progress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
          rightArrowOpacity.setValue(progress);
          rightArrowTranslateX.setValue(20 - progress * 20);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const dx = gestureState.dx;

        if (dx > SWIPE_THRESHOLD && currentPage === 0 && onPrevChapter) {
          // Swiped right on first page - go to previous chapter
          hideArrow(leftArrowOpacity, leftArrowTranslateX);
          onPrevChapter();
        } else if (
          dx < -SWIPE_THRESHOLD &&
          currentPage === totalPages - 1 &&
          onNextChapter
        ) {
          // Swiped left on last page - go to next chapter
          hideArrow(rightArrowOpacity, rightArrowTranslateX);
          onNextChapter();
        } else {
          // Not enough swipe - hide arrows
          hideArrow(leftArrowOpacity, leftArrowTranslateX);
          hideArrow(rightArrowOpacity, rightArrowTranslateX);
        }
      },
      onPanResponderTerminate: () => {
        hideArrow(leftArrowOpacity, leftArrowTranslateX);
        hideArrow(rightArrowOpacity, rightArrowTranslateX);
      },
    }),
  ).current;

  const handleScroll = useCallback(
    (event: any) => {
      const scrollY = event.nativeEvent.contentOffset.y;
      const pageHeight = height * 0.8;
      const newPage = Math.round(scrollY / pageHeight);

      if (newPage !== currentPage && newPage >= 0 && newPage < totalPages) {
        setCurrentPage(newPage);
        onPageChange(newPage + 1, totalPages);
      }
    },
    [currentPage, totalPages, onPageChange],
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
    <View style={styles.container} {...panResponder.panHandlers}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        showsVerticalScrollIndicator={false}
      >
        {pages.map((index) => {
          const pageUrl = apiClient.getPageUrl(mangaId, chapterId, index + 1);
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

      {/* Left Arrow Indicator (Previous Chapter) */}
      {currentPage === 0 && onPrevChapter && (
        <Animated.View
          style={[
            styles.arrowContainer,
            styles.leftArrow,
            {
              opacity: leftArrowOpacity,
              transform: [{ translateX: leftArrowTranslateX }],
            },
          ]}
        >
          <MaterialCommunityIcons name="chevron-left" size={48} color="#fff" />
        </Animated.View>
      )}

      {/* Right Arrow Indicator (Next Chapter) */}
      {currentPage === totalPages - 1 && onNextChapter && (
        <Animated.View
          style={[
            styles.arrowContainer,
            styles.rightArrow,
            {
              opacity: rightArrowOpacity,
              transform: [{ translateX: rightArrowTranslateX }],
            },
          ]}
        >
          <MaterialCommunityIcons name="chevron-right" size={48} color="#fff" />
        </Animated.View>
      )}
    </View>
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
  arrowContainer: {
    position: "absolute",
    top: "50%",
    width: 60,
    height: 60,
    marginTop: -30,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  leftArrow: {
    left: 20,
  },
  rightArrow: {
    right: 20,
  },
});
