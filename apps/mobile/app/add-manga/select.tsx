import { useState, useMemo } from "react";
import {
  View,
  FlatList,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Appbar,
  Card,
  Text,
  ActivityIndicator,
  Button,
  Chip,
  Checkbox,
  Snackbar,
} from "react-native-paper";
import { Image } from "expo-image";
import { useSourceManga, useImportManga } from "@/api/hooks";
import { SourceMangaChapter } from "@/types";

const { width } = Dimensions.get("window");
const COVER_HEIGHT = 100;

export default function AddMangaSelectScreen() {
  const { sourceId, sourceMangaId, title, coverUrl } = useLocalSearchParams<{
    sourceId: string;
    sourceMangaId: string;
    title: string;
    coverUrl?: string;
  }>();

  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(
    new Set(),
  );
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const { data: mangaDetails, isLoading } = useSourceManga(
    sourceId || "",
    sourceMangaId || "",
  );
  const importManga = useImportManga();

  const chapters = mangaDetails?.chapters || [];

  const languages = useMemo(() => {
    const langs = new Set<string>();
    chapters.forEach((ch) => {
      if (ch.language) langs.add(ch.language);
    });
    return Array.from(langs).sort();
  }, [chapters]);

  const filteredChapters = useMemo(() => {
    let filtered = [...chapters];
    if (languageFilter) {
      filtered = filtered.filter((ch) => ch.language === languageFilter);
    }
    filtered.sort((a, b) =>
      sortAsc ? a.sortOrder - b.sortOrder : b.sortOrder - a.sortOrder,
    );
    return filtered;
  }, [chapters, languageFilter, sortAsc]);

  const allVisibleSelected =
    filteredChapters.length > 0 &&
    filteredChapters.every((ch) => selectedChapters.has(ch.chapterId));
  const selectedCount = selectedChapters.size;

  const toggleChapter = (chapterId: string) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredChapters.forEach((ch) => next.delete(ch.chapterId));
      } else {
        filteredChapters.forEach((ch) => next.add(ch.chapterId));
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (selectedCount === 0) return;
    setImporting(true);
    try {
      const chaptersToImport = chapters.filter((ch) =>
        selectedChapters.has(ch.chapterId),
      );
      const result = await importManga.mutateAsync({
        sourceId: sourceId || "",
        sourceMangaId: sourceMangaId || "",
        chapters: chaptersToImport,
      });
      router.push({
        pathname: "/add-manga/import" as any,
        params: { mangaId: result.mangaId, title: title || "" },
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to import manga",
      );
    } finally {
      setImporting(false);
    }
  };

  if (!sourceId || !sourceMangaId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>Invalid manga selection</Text>
        <Button
          onPress={() => router.back()}
          mode="contained"
          buttonColor="#6366f1"
          style={{ marginTop: 16 }}
        >
          Go Back
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={title || "Select Chapters"} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : !mangaDetails ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Could not load manga details</Text>
          <Button
            onPress={() => router.back()}
            mode="contained"
            buttonColor="#6366f1"
            style={{ marginTop: 16 }}
          >
            Go Back
          </Button>
        </View>
      ) : chapters.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No chapters available</Text>
          <Button
            onPress={() => router.back()}
            mode="contained"
            buttonColor="#6366f1"
            style={{ marginTop: 16 }}
          >
            Go Back
          </Button>
        </View>
      ) : (
        <>
          <Card style={styles.mangaInfoCard}>
            <View style={styles.mangaInfoRow}>
              {coverUrl ? (
                <Image
                  source={{ uri: coverUrl }}
                  style={styles.mangaCover}
                  contentFit="cover"
                />
              ) : null}
              <View style={styles.mangaInfoText}>
                <Text style={styles.mangaTitle}>{mangaDetails.title}</Text>
                <Text style={styles.mangaMeta}>
                  {mangaDetails.chapters.length} chapters
                </Text>
                <Text style={styles.mangaMeta}>
                  {selectedCount} selected
                </Text>
              </View>
            </View>
          </Card>

          <View style={styles.toolbar}>
            <Button
              mode="text"
              onPress={toggleSelectAll}
              textColor="#6366f1"
              compact
            >
              {allVisibleSelected ? "Deselect All" : "Select All"}
            </Button>

            {languages.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.langScroll}
              >
                <Chip
                  selected={languageFilter === null}
                  onPress={() => setLanguageFilter(null)}
                  style={styles.langFilterChip}
                  showSelectedCheck={false}
                  compact
                >
                  All
                </Chip>
                {languages.map((lang) => (
                  <Chip
                    key={lang}
                    selected={languageFilter === lang}
                    onPress={() => setLanguageFilter(lang)}
                    style={styles.langFilterChip}
                    showSelectedCheck={false}
                    compact
                  >
                    {lang}
                  </Chip>
                ))}
              </ScrollView>
            )}

            <Button
              mode="text"
              onPress={() => setSortAsc(!sortAsc)}
              textColor="#6366f1"
              compact
            >
              {sortAsc ? "↑ Oldest" : "↓ Newest"}
            </Button>
          </View>

          <FlatList
            data={filteredChapters}
            renderItem={({ item }: { item: SourceMangaChapter }) => {
              const checked = selectedChapters.has(item.chapterId);
              return (
                <View style={styles.chapterRow}>
                  <Checkbox
                    status={checked ? "checked" : "unchecked"}
                    onPress={() => toggleChapter(item.chapterId)}
                  />
                  <View style={styles.chapterInfo}>
                    <Text style={styles.chapterText} numberOfLines={1}>
                      Ch.{" "}
                      {Number.isNaN(Number(item.chapterId))
                        ? item.chapterId
                        : String(parseInt(item.chapterId, 10))}
                      {item.title ? ` - ${item.title}` : ""}
                    </Text>
                  </View>
                  {item.language && (
                    <Chip style={styles.langChip} textStyle={styles.langChipText} compact>
                      {item.language}
                    </Chip>
                  )}
                </View>
              );
            }}
            keyExtractor={(item) => item.chapterId}
            style={styles.chapterList}
            contentContainerStyle={styles.chapterListContent}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Selected: {selectedCount} / {chapters.length}
            </Text>
            <Button
              mode="contained"
              onPress={handleImport}
              disabled={selectedCount === 0 || importing}
              loading={importing}
              buttonColor="#6366f1"
            >
              Import {selectedCount} Ch{selectedCount !== 1 ? "s" : ""}
            </Button>
          </View>

          <Snackbar
            visible={!!error}
            onDismiss={() => setError(null)}
            action={{ label: "Dismiss", onPress: () => setError(null) }}
          >
            {error}
          </Snackbar>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  header: {
    backgroundColor: "#1a1a1a",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  mangaInfoCard: {
    margin: 12,
    backgroundColor: "#252525",
  },
  mangaInfoRow: {
    flexDirection: "row",
    padding: 12,
  },
  mangaCover: {
    width: 72,
    height: COVER_HEIGHT,
    borderRadius: 8,
    backgroundColor: "#333",
  },
  mangaInfoText: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  mangaTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  mangaMeta: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 2,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    flexWrap: "wrap",
    gap: 4,
  },
  langScroll: {
    flexGrow: 1,
    maxHeight: 36,
  },
  langFilterChip: {
    backgroundColor: "#252525",
    marginHorizontal: 2,
  },
  chapterList: {
    flex: 1,
  },
  chapterListContent: {
    paddingBottom: 80,
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
  },
  chapterInfo: {
    flex: 1,
    marginLeft: 4,
  },
  chapterText: {
    color: "#fff",
    fontSize: 14,
  },
  langChip: {
    backgroundColor: "#333",
    height: 28,
  },
  langChipText: {
    fontSize: 11,
    color: "#9ca3af",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#252525",
    borderTopWidth: 0.5,
    borderTopColor: "#374151",
  },
  footerText: {
    color: "#d1d5db",
    fontSize: 14,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 16,
    textAlign: "center",
  },
});
