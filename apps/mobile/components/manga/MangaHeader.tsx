import React, { useCallback } from "react";
import { View, StyleSheet } from "react-native";
import {
  Text,
  Button,
  Chip,
  Menu,
  Divider,
  IconButton,
  ActivityIndicator,
} from "react-native-paper";
import { Image } from "expo-image";
import type { Manga, Chapter, Category, ReadingProgress } from "@/types";

interface MangaHeaderProps {
  manga: Manga;
  coverUrl: string | undefined;
  sortedChapters: Chapter[];
  currentChapter: Chapter | undefined;
  progressMap: Record<string, ReadingProgress>;
  allCategories: Category[] | undefined;
  mangaCategories: Category[] | undefined;
  categoryMenuVisible: boolean;
  onCategoryMenuDismiss: () => void;
  onCategoryMenuOpen: () => void;
  onCategoryToggle: (category: Category) => void;
  onContinueReading: () => void;
  onDeletePress: () => void;
  onCheckUpdates?: () => void;
  onDownloadAll?: () => void;
  hasPendingChapters?: boolean;
  isCheckingUpdates?: boolean;
  isDownloadingAll?: boolean;
}

const META_COLOR = "#9ca3af";
const TEXT_COLOR = "#fff";
const ICON_COLOR = "#d1d5db";
const DELETE_ICON_COLOR = "#ef4444";
const CATEGORY_CHIP_COLOR = "#6366f1";
const GENRE_CHIP_COLOR = "#374151";
const DIVIDER_COLOR = "#374151";

/**
 * Check if manga is in a specific category
 */
function useIsInCategory(
  mangaCategories: Category[] | undefined,
  categoryId: string,
): boolean {
  return mangaCategories?.some((c) => c.id === categoryId) ?? false;
}

/**
 * Manga header component - extracted to prevent re-renders
 * Displays cover image, title, metadata, actions, categories, and genres
 */
export const MangaHeader = React.memo(function MangaHeader({
  manga,
  coverUrl,
  sortedChapters,
  currentChapter,
  progressMap,
  allCategories,
  mangaCategories,
  categoryMenuVisible,
  onCategoryMenuDismiss,
  onCategoryMenuOpen,
  onCategoryToggle,
  onContinueReading,
  onDeletePress,
  onCheckUpdates,
  onDownloadAll,
  hasPendingChapters,
  isCheckingUpdates,
  isDownloadingAll,
}: MangaHeaderProps) {
  // Determine continue button text based on progress
  const getContinueButtonText = useCallback((): string => {
    if (!currentChapter) {
      return "Start Reading";
    }

    const progress = currentChapter.id
      ? progressMap[currentChapter.id]
      : undefined;
    const hasProgress =
      progress && progress.percentComplete > 0 && !progress.isCompleted;

    if (hasProgress) {
      return `Continue Chapter ${currentChapter.chapterId || ""}`;
    }

    return "Start Reading";
  }, [currentChapter, progressMap]);

  return (
    <View style={styles.header}>
      {/* Cover and Info Section */}
      <View style={styles.coverSection}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={styles.cover}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Text style={styles.coverPlaceholderText}>{manga.title}</Text>
          </View>
        )}
        <View style={styles.infoSection}>
          <Text variant="titleLarge" style={styles.title} numberOfLines={3}>
            {manga.title}
          </Text>
          {manga.author ? (
            <Text variant="bodyMedium" style={styles.meta}>
              Author: {manga.author}
            </Text>
          ) : null}
          {manga.artist ? (
            <Text variant="bodyMedium" style={styles.meta}>
              Artist: {manga.artist}
            </Text>
          ) : null}
          <Text variant="bodyMedium" style={styles.meta}>
            Status: {manga.status}
          </Text>
          <Text variant="bodyMedium" style={styles.meta}>
            Type: {manga.mediaType}
          </Text>
          <Text variant="bodyMedium" style={styles.meta}>
            Chapters: {sortedChapters?.length || 0}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <Button
          mode="contained"
          onPress={onContinueReading}
          style={styles.continueButton}
          disabled={sortedChapters.length === 0}
        >
          {getContinueButtonText()}
        </Button>

        {onCheckUpdates && (
          <IconButton
            icon="refresh"
            onPress={onCheckUpdates}
            iconColor={ICON_COLOR}
            disabled={isCheckingUpdates}
          />
        )}

        {hasPendingChapters && onDownloadAll && (
          <IconButton
            icon="download"
            onPress={onDownloadAll}
            iconColor="#22c55e"
            disabled={isDownloadingAll}
          />
        )}

        <Menu
          visible={categoryMenuVisible}
          onDismiss={onCategoryMenuDismiss}
          anchor={
            <IconButton
              icon="tag"
              onPress={onCategoryMenuOpen}
              iconColor={ICON_COLOR}
            />
          }
        >
          {allCategories?.map((category) => (
            <Menu.Item
              key={category.id}
              onPress={() => onCategoryToggle(category)}
              title={category.name}
              leadingIcon={
                useIsInCategory(mangaCategories, category.id)
                  ? "check"
                  : undefined
              }
            />
          ))}
        </Menu>

        <IconButton
          icon="delete"
          onPress={onDeletePress}
          iconColor={DELETE_ICON_COLOR}
        />
      </View>

      {/* Category Chips */}
      {mangaCategories && mangaCategories.length > 0 ? (
        <View style={styles.categories}>
          {mangaCategories.map((category) => (
            <Chip
              key={category.id}
              style={styles.categoryChip}
              textStyle={styles.chipText}
            >
              {category.name}
            </Chip>
          ))}
        </View>
      ) : null}

      {/* Genre Chips */}
      {manga.genres && manga.genres.length > 0 ? (
        <View style={styles.genres}>
          {manga.genres.map((genre) => (
            <Chip
              key={genre}
              style={styles.genreChip}
              textStyle={styles.genreChipText}
            >
              {genre}
            </Chip>
          ))}
        </View>
      ) : null}

      <Divider style={styles.divider} />

      <Text variant="titleSmall" style={styles.sectionTitle}>
        Chapters
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    paddingVertical: 16,
  },
  coverSection: {
    flexDirection: "row",
    gap: 16,
  },
  cover: {
    width: 120,
    height: 180,
    borderRadius: 8,
    borderCurve: "continuous",
  },
  coverPlaceholder: {
    backgroundColor: "#333333",
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
  },
  coverPlaceholderText: {
    color: META_COLOR,
    fontSize: 12,
    textAlign: "center",
  },
  infoSection: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: TEXT_COLOR,
    fontWeight: "bold",
    marginBottom: 8,
  },
  meta: {
    color: META_COLOR,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    gap: 8,
  },
  continueButton: {
    flex: 1,
  },
  categories: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  categoryChip: {
    backgroundColor: CATEGORY_CHIP_COLOR,
  },
  chipText: {
    color: "#fff",
  },
  genres: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  genreChip: {
    backgroundColor: GENRE_CHIP_COLOR,
  },
  genreChipText: {
    color: ICON_COLOR,
    fontSize: 12,
  },
  divider: {
    backgroundColor: DIVIDER_COLOR,
    marginVertical: 16,
  },
  sectionTitle: {
    color: TEXT_COLOR,
    fontWeight: "bold",
    marginBottom: 8,
  },
});
