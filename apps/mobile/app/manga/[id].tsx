import { useState, useRef, useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  FlatList,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Text,
  Button,
  Chip,
  ActivityIndicator,
  IconButton,
  Menu,
  Divider,
  Portal,
  Dialog,
} from "react-native-paper";
import { WebView } from "react-native-webview";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  useManga,
  useChapters,
  useProgress,
  useCategories,
  useMangaCategories,
  useAddMangaToCategory,
  useRemoveMangaFromCategory,
  useDeleteManga,
} from "@/api/hooks";
import { apiClient } from "@/api/client";
import { Chapter, Category } from "@/types";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function MangaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [categoryMenuVisible, setCategoryMenuVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [webViewHeight, setWebViewHeight] = useState(100);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const { data: manga, isLoading: mangaLoading } = useManga(id);
  const { data: chapters, isLoading: chaptersLoading } = useChapters(id);
  const { data: progress } = useProgress(id);
  const { data: allCategories } = useCategories();
  const { data: mangaCategories } = useMangaCategories(id);
  const addToCategory = useAddMangaToCategory();
  const removeFromCategory = useRemoveMangaFromCategory();
  const deleteManga = useDeleteManga();

  if (mangaLoading || !manga) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const coverUrl = apiClient.getCoverUrl(manga.coverImage);
  const sortedChapters = chapters
    ? [...chapters].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const currentChapter = progress?.chapterId
    ? sortedChapters.find((c) => c.id === progress.chapterId)
    : sortedChapters[0];

  const handleContinueReading = () => {
    if (currentChapter) {
      router.push(`/reader/${manga.id}/${currentChapter.id}`);
    }
  };

  const handleChapterPress = (chapter: Chapter) => {
    router.push(`/reader/${manga.id}/${chapter.id}`);
  };

  const handleDelete = async () => {
    await deleteManga.mutateAsync(id);
    setDeleteDialogVisible(false);
    router.back();
  };

  const isInCategory = (categoryId: string) =>
    mangaCategories?.some((c) => c.id === categoryId);

  const handleCategoryToggle = (category: Category) => {
    if (isInCategory(category.id)) {
      removeFromCategory.mutate({ mangaId: id, categoryId: category.id });
    } else {
      addToCategory.mutate({ mangaId: id, categoryId: category.id });
    }
  };

  const webViewScript = `
    setInterval(function() { 
      window.ReactNativeWebView.postMessage(document.documentElement.scrollHeight.toString()); 
    }, 500);
    true;
  `;

  const renderHeader = () => (
    <View style={styles.header}>
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
          {manga.author && (
            <Text variant="bodyMedium" style={styles.meta}>
              Author: {manga.author}
            </Text>
          )}
          {manga.artist && (
            <Text variant="bodyMedium" style={styles.meta}>
              Artist: {manga.artist}
            </Text>
          )}
          <Text variant="bodyMedium" style={styles.meta}>
            Status: {manga.status}
          </Text>
          <Text variant="bodyMedium" style={styles.meta}>
            Type: {manga.mediaType}
          </Text>
          <Text variant="bodyMedium" style={styles.meta}>
            Chapters: {chapters?.length || 0}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          mode="contained"
          onPress={handleContinueReading}
          style={styles.continueButton}
          disabled={sortedChapters.length === 0}
        >
          {progress?.chapterId
            ? `Continue Chapter ${currentChapter?.chapterId || ""}`
            : "Start Reading"}
        </Button>

        <Menu
          visible={categoryMenuVisible}
          onDismiss={() => setCategoryMenuVisible(false)}
          anchor={
            <IconButton
              icon="tag"
              onPress={() => setCategoryMenuVisible(true)}
              iconColor="#d1d5db"
            />
          }
        >
          {allCategories?.map((category) => (
            <Menu.Item
              key={category.id}
              onPress={() => handleCategoryToggle(category)}
              title={category.name}
              leadingIcon={isInCategory(category.id) ? "check" : undefined}
            />
          ))}
        </Menu>

        <IconButton
          icon="delete"
          onPress={() => setDeleteDialogVisible(true)}
          iconColor="#ef4444"
        />
      </View>

      {mangaCategories && mangaCategories.length > 0 && (
        <View style={styles.categories}>
          {mangaCategories.map((category) => (
            <Chip
              key={category.id}
              style={styles.categoryChip}
              textStyle={{ color: "#fff" }}
            >
              {category.name}
            </Chip>
          ))}
        </View>
      )}

      {manga.genres && manga.genres.length > 0 && (
        <View style={styles.genres}>
          {manga.genres.map((genre) => (
            <Chip
              key={genre}
              style={styles.genreChip}
              textStyle={{ color: "#d1d5db", fontSize: 12 }}
            >
              {genre}
            </Chip>
          ))}
        </View>
      )}

      {manga.description && (
        <View style={styles.descriptionSection}>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Description
          </Text>
          <View
            style={{
              height: showFullDescription ? webViewHeight : 100,
              overflow: "hidden",
            }}
          >
            <WebView
              originWhitelist={["*"]}
              source={{
                html: `
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
                      <style>
                        body {
                          margin: 0;
                          padding: 8px 0;
                          background-color: #1a1a1a;
                          color: #9ca3af;
                          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                          font-size: 14px;
                          line-height: 1.5;
                        }
                        a { color: #6366f1; }
                        p { margin: 0 0 8px 0; }
                      </style>
                    </head>
                    <body>
                      ${manga.description}
                    </body>
                  </html>
                `,
              }}
              style={[styles.webview, { height: webViewHeight }]}
              automaticallyAdjustContentInsets={false}
              scrollEnabled={false}
              javaScriptEnabled={true}
              injectedJavaScript={webViewScript}
              domStorageEnabled={true}
              onMessage={(event) => {
                setWebViewHeight(parseInt(event.nativeEvent.data, 10));
              }}
            />
          </View>
          <Button
            mode="text"
            onPress={() => setShowFullDescription(!showFullDescription)}
            textColor="#6366f1"
            style={styles.showMoreButton}
          >
            {showFullDescription ? "Show less" : "Show more"}
          </Button>
        </View>
      )}

      <Divider style={styles.divider} />

      <Text variant="titleSmall" style={styles.sectionTitle}>
        Chapters
      </Text>
    </View>
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        {chaptersLoading ? (
          <View style={[styles.container, styles.centered]}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : sortedChapters.length === 0 ? (
          <View style={styles.container}>
            {renderHeader()}
            <Text style={styles.emptyText}>No chapters available</Text>
          </View>
        ) : (
          <FlatList
            data={sortedChapters}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderHeader}
            renderItem={({ item: chapter }) => (
              <Button
                mode="text"
                onPress={() => handleChapterPress(chapter)}
                style={[
                  styles.chapterButton,
                  progress?.chapterId === chapter.id && styles.currentChapter,
                ]}
                labelStyle={styles.chapterLabel}
                contentStyle={styles.chapterContent}
              >
                <View style={styles.chapterRow}>
                  <Text style={styles.chapterText}>
                    Chapter {chapter.chapterId}
                    {chapter.title ? ` - ${chapter.title}` : ""}
                  </Text>
                  {chapter.importStatus !== "complete" && (
                    <MaterialCommunityIcons
                      name="download"
                      size={16}
                      color="#6366f1"
                    />
                  )}
                </View>
              </Button>
            )}
            getItemLayout={(data, index) => ({
              length: 44,
              offset: 44 * index,
              index,
            })}
            initialNumToRender={20}
            maxToRenderPerBatch={50}
            windowSize={10}
            removeClippedSubviews={true}
            contentContainerStyle={styles.flatListContent}
          />
        )}

        <Portal>
          <Dialog
            visible={deleteDialogVisible}
            onDismiss={() => setDeleteDialogVisible(false)}
            style={{ backgroundColor: "#252525" }}
          >
            <Dialog.Title style={{ color: "#fff" }}>Delete Manga</Dialog.Title>
            <Dialog.Content>
              <Text style={{ color: "#d1d5db" }}>
                Are you sure you want to delete "{manga.title}"? This action
                cannot be undone.
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button
                onPress={() => setDeleteDialogVisible(false)}
                textColor="#d1d5db"
              >
                Cancel
              </Button>
              <Button onPress={handleDelete} textColor="#ef4444">
                Delete
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
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
  },
  coverPlaceholder: {
    backgroundColor: "#333333",
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
  },
  coverPlaceholderText: {
    color: "#9ca3af",
    fontSize: 12,
    textAlign: "center",
  },
  infoSection: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: "#fff",
    fontWeight: "bold",
    marginBottom: 8,
  },
  meta: {
    color: "#9ca3af",
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
    backgroundColor: "#6366f1",
  },
  genres: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  genreChip: {
    backgroundColor: "#374151",
  },
  descriptionSection: {
    marginTop: 16,
  },
  sectionTitle: {
    color: "#fff",
    fontWeight: "bold",
    marginBottom: 8,
  },
  description: {
    color: "#9ca3af",
    lineHeight: 20,
  },
  webview: {
    backgroundColor: "#1a1a1a",
  },
  showMoreButton: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  divider: {
    backgroundColor: "#374151",
    marginVertical: 16,
  },
  flatListContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  chapterButton: {
    marginVertical: 2,
  },
  currentChapter: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
  },
  chapterLabel: {
    color: "#d1d5db",
  },
  chapterContent: {
    justifyContent: "flex-start",
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chapterText: {
    color: "#d1d5db",
    fontSize: 14,
  },
  loader: {
    marginTop: 32,
  },
  emptyText: {
    color: "#6b7280",
    textAlign: "center",
    marginTop: 32,
  },
});
