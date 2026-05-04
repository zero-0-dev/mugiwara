import React, { useRef, useCallback, useEffect, useMemo, memo } from "react";
import {
  View,
  FlatList,
  Dimensions,
  StyleSheet,
  Animated,
  PanResponder,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/api/client";
import type { PageInfo } from "@/types";

const { width, height } = Dimensions.get("window");
const SWIPE_THRESHOLD = width * 0.15;
const DEFAULT_ASPECT_RATIO = 0.7;

interface VerticalReaderProps {
  mangaId: string;
  chapterId: string;
  initialPage: number;
  totalPages: number;
  pages?: PageInfo[];
  onPageChange: (page: number, total: number) => void;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
}

interface PageItemProps {
  index: number;
  url: string;
  aspectRatio: number;
}

const PageItem = memo(({ index, url, aspectRatio }: PageItemProps) => {
  return (
    <View style={styles.pageContainer}>
      <Image
        source={{ uri: url }}
        style={[styles.image, { aspectRatio }]}
        contentFit="contain"
        transition={200}
        cachePolicy="memory-disk"
        contentPosition="center"
      />
    </View>
  );
});

PageItem.displayName = "PageItem";

export const VerticalReader = React.memo(function VerticalReader({
  mangaId,
  chapterId,
  initialPage,
  totalPages,
  pages,
  onPageChange,
  onPrevChapter,
  onNextChapter,
}: VerticalReaderProps) {
  const flatListRef = useRef<FlatList>(null);
  const currentPageRef = useRef(initialPage);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const hasScrolledToInitialRef = useRef(false);

  const leftArrowOpacity = useRef(new Animated.Value(0)).current;
  const rightArrowOpacity = useRef(new Animated.Value(0)).current;
  const leftArrowTranslateX = useRef(new Animated.Value(-20)).current;
  const rightArrowTranslateX = useRef(new Animated.Value(20)).current;

  const pageDataList = useMemo(() => {
    const safePages = pages ?? [];
    return Array.from({ length: totalPages }, (_, i) => {
      const serverPage = safePages[i];
      const aspectRatio =
        serverPage?.width && serverPage?.height
          ? serverPage.width / serverPage.height
          : DEFAULT_ASPECT_RATIO;
      return {
        url: apiClient.getPageUrl(mangaId, chapterId, i + 1),
        aspectRatio,
      };
    });
  }, [mangaId, chapterId, totalPages, pages]);

  const offsets = useMemo(() => {
    const result: number[] = [];
    let cumulativeOffset = 0;
    for (let i = 0; i < pageDataList.length; i++) {
      result.push(cumulativeOffset);
      cumulativeOffset += width / pageDataList[i].aspectRatio;
    }
    return result;
  }, [pageDataList]);

  const handleScrollEnd = useCallback(
    (scrollY: number) => {
      const viewportCenter = scrollY + height / 2;

      for (let i = 0; i < offsets.length; i++) {
        const pageMidY =
          offsets[i] + (width / pageDataList[i].aspectRatio) / 2;
        if (viewportCenter <= pageMidY) {
          currentPageRef.current = i;
          onPageChangeRef.current(i + 1, totalPages);
          return;
        }
      }

      currentPageRef.current = totalPages - 1;
      onPageChangeRef.current(totalPages, totalPages);
    },
    [offsets, pageDataList, totalPages, height],
  );

  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (scrollEndTimerRef.current) {
        clearTimeout(scrollEndTimerRef.current);
      }
      const scrollY = event.nativeEvent.contentOffset.y;
      scrollEndTimerRef.current = setTimeout(() => {
        scrollEndTimerRef.current = null;
        handleScrollEnd(scrollY);
      }, 0);
    },
    [handleScrollEnd],
  );

  useEffect(() => {
    return () => {
      if (scrollEndTimerRef.current) {
        clearTimeout(scrollEndTimerRef.current);
      }
    };
  }, []);

  const showArrow = useCallback(
    (opacity: Animated.Value, translateX: Animated.Value, toValue: number) => {
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
    },
    [],
  );

  const hideArrow = useCallback(
    (opacity: Animated.Value, translateX: Animated.Value) => {
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
    },
    [],
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          Math.abs(gestureState.dx) > 5
        );
      },
      onPanResponderMove: (_, gestureState) => {
        const dx = gestureState.dx;
        const page = currentPageRef.current;

        if (dx > 0 && page === 0 && onPrevChapter) {
          const progress = Math.min(dx / SWIPE_THRESHOLD, 1);
          leftArrowOpacity.setValue(progress);
          leftArrowTranslateX.setValue(-20 + progress * 20);
        } else if (dx < 0 && page === totalPages - 1 && onNextChapter) {
          const progress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
          rightArrowOpacity.setValue(progress);
          rightArrowTranslateX.setValue(20 - progress * 20);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const dx = gestureState.dx;
        const page = currentPageRef.current;

        if (dx > SWIPE_THRESHOLD && page === 0 && onPrevChapter) {
          hideArrow(leftArrowOpacity, leftArrowTranslateX);
          onPrevChapter();
        } else if (
          dx < -SWIPE_THRESHOLD &&
          page === totalPages - 1 &&
          onNextChapter
        ) {
          hideArrow(rightArrowOpacity, rightArrowTranslateX);
          onNextChapter();
        } else {
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

  useEffect(() => {
    if (!hasScrolledToInitialRef.current && initialPage > 0 && flatListRef.current && offsets.length > 0) {
      hasScrolledToInitialRef.current = true;
      const timeoutId = setTimeout(() => {
        const offset = offsets[initialPage];
        if (offset !== undefined) {
          flatListRef.current?.scrollToOffset({
            offset,
            animated: false,
          });
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [initialPage, offsets]);

  const renderItem = useCallback(
    ({ index }: { index: number }) => {
      const { url, aspectRatio } = pageDataList[index];
      return <PageItem index={index} url={url} aspectRatio={aspectRatio} />;
    },
    [pageDataList],
  );

  const keyExtractor = useCallback(
    (_: any, index: number) => `page-${index}`,
    [],
  );

  const listData = useMemo(() => {
    return Array.from({ length: totalPages }, (_, i) => i);
  }, [totalPages]);

  const getItemLayout = useCallback(
    (_data: any, index: number) => {
      const length = width / pageDataList[index].aspectRatio;
      return { length, offset: offsets[index], index };
    },
    [pageDataList, offsets, width],
  );

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <FlatList
        ref={flatListRef}
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        showsVerticalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={7}
      />

      {onPrevChapter && (
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

      {onNextChapter && (
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
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  pageContainer: {
    width,
    backgroundColor: "#000",
  },
  image: {
    width: "100%",
    backgroundColor: "#000",
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
