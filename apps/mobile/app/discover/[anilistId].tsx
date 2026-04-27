import { useState, useMemo, useEffect } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Appbar,
  Text,
  ActivityIndicator,
  Button,
  Chip,
  Card,
  Snackbar,
} from "react-native-paper";
import { Image } from "expo-image";
import { useDiscoverManga, useSources, useSearchSource } from "@/api/hooks";
import { useDebounce } from "@/hooks/useDebounce";
import { SearchResult } from "@/types";

const { width } = Dimensions.get("window");
const COVER_HEIGHT = 300;

export default function DiscoverDetailScreen() {
  const { anilistId } = useLocalSearchParams<{ anilistId: string }>();
  const parsedId = anilistId ? parseInt(anilistId, 10) : null;

  const { data: manga, isLoading } = useDiscoverManga(parsedId);

  const [showDescription, setShowDescription] = useState(false);

  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const { data: sources } = useSources();
  const remoteSources = useMemo(
    () => sources?.filter((s) => s.id !== "local") || [],
    [sources],
  );

  const searchTitle = manga?.title.english || manga?.title.romaji || "";
  const { data: searchResults, isLoading: searching } = useSearchSource(
    selectedSource || "",
    searchTitle,
  );

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSource && remoteSources.length > 0) {
      setSelectedSource(remoteSources[0].id);
    }
  }, [remoteSources, selectedSource]);

  const handleSourceResultPress = (result: SearchResult) => {
    router.push({
      pathname: "/add-manga/select" as any,
      params: {
        sourceId: selectedSource || "",
        sourceMangaId: result.sourceMangaId,
        title: result.title,
        coverUrl: result.coverImageUrl || "",
      },
    });
  };

  if (isLoading || !manga) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const title = manga.title.english || manga.title.romaji;
  const nativeTitle = manga.title.native;

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Discover" />
      </Appbar.Header>

      <ScrollView style={styles.scroll}>
        <View style={styles.coverContainer}>
          {manga.coverImage?.large ? (
            <Image
              source={{ uri: manga.coverImage.large }}
              style={styles.coverImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Text style={styles.coverPlaceholderText}>
                {title.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {manga.bannerImage && (
            <Image
              source={{ uri: manga.bannerImage }}
              style={styles.bannerImage}
              contentFit="cover"
            />
          )}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.title}>{title}</Text>
          {nativeTitle && nativeTitle !== title && (
            <Text style={styles.nativeTitle}>{nativeTitle}</Text>
          )}

          <View style={styles.metaRow}>
            {manga.averageScore && (
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>
                  {manga.averageScore}%
                </Text>
              </View>
            )}
            <Text style={styles.metaText}>
              {manga.mediaType.toUpperCase()}
            </Text>
            <Text style={styles.metaDivider}>|</Text>
            <Text style={styles.metaText}>{manga.status}</Text>
            {manga.chapters && (
              <>
                <Text style={styles.metaDivider}>|</Text>
                <Text style={styles.metaText}>{manga.chapters} chapters</Text>
              </>
            )}
          </View>

          <View style={styles.genresRow}>
            {manga.genres.map((genre) => (
              <Chip
                key={genre}
                style={styles.genreChip}
                textStyle={styles.genreChipText}
                compact
              >
                {genre}
              </Chip>
            ))}
          </View>

          {manga.author && (
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>Author: </Text>
              {manga.author}
            </Text>
          )}
          {manga.artist && (
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>Artist: </Text>
              {manga.artist}
            </Text>
          )}

          {manga.description && (
            <View style={styles.descriptionSection}>
              <Text
                numberOfLines={showDescription ? undefined : 4}
                style={styles.description}
              >
                {manga.description.replace(/<[^>]*>/g, "")}
              </Text>
              <Button
                mode="text"
                onPress={() => setShowDescription(!showDescription)}
                textColor="#6366f1"
                compact
              >
                {showDescription ? "Show less" : "Show more"}
              </Button>
            </View>
          )}

          {manga.tags && manga.tags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <View style={styles.tagsRow}>
                {manga.tags.slice(0, 10).map((tag) => (
                  <Chip
                    key={tag.name}
                    style={styles.tagChip}
                    textStyle={styles.tagChipText}
                    compact
                  >
                    {tag.name}
                  </Chip>
                ))}
              </View>
            </View>
          )}

          <View style={styles.addSection}>
            <Text style={styles.sectionTitle}>Add to Library</Text>
            <Text style={styles.addSectionSub}>
              Select a source to search for "{title}"
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.sourceTabs}
              contentContainerStyle={styles.sourceTabsContent}
            >
              {remoteSources.map((source) => (
                <Chip
                  key={source.id}
                  selected={selectedSource === source.id}
                  onPress={() => setSelectedSource(source.id)}
                  style={styles.sourceChip}
                  showSelectedCheck={false}
                >
                  {source.name}
                </Chip>
              ))}
            </ScrollView>

            {searching && (
              <View style={styles.centered}>
                <ActivityIndicator size="small" color="#6366f1" />
                <Text style={styles.searchingText}>Searching...</Text>
              </View>
            )}

            {!searching && searchResults && searchResults.length > 0 && (
              <View style={styles.sourceResults}>
                <Text style={styles.sourceResultsTitle}>
                  Results from source:
                </Text>
                {searchResults.map((result) => (
                  <Card
                    key={`${selectedSource}-${result.sourceMangaId}`}
                    style={styles.sourceResultCard}
                    onPress={() => handleSourceResultPress(result)}
                  >
                    <View style={styles.sourceResultRow}>
                      {result.coverImageUrl && (
                        <Image
                          source={{ uri: result.coverImageUrl }}
                          style={styles.sourceResultCover}
                          contentFit="cover"
                        />
                      )}
                      <View style={styles.sourceResultInfo}>
                        <Text
                          numberOfLines={2}
                          style={styles.sourceResultTitle}
                        >
                          {result.title}
                        </Text>
                        {result.author && (
                          <Text style={styles.sourceResultAuthor}>
                            {result.author}
                          </Text>
                        )}
                      </View>
                    </View>
                  </Card>
                ))}
              </View>
            )}

            {!searching &&
              searchResults &&
              searchResults.length === 0 &&
              searchTitle.length > 0 && (
                <Text style={styles.noResultsText}>
                  No results found in this source
                </Text>
              )}
          </View>
        </View>
      </ScrollView>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError(null)}
        action={{ label: "Dismiss", onPress: () => setError(null) }}
      >
        {error}
      </Snackbar>
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
  scroll: {
    flex: 1,
  },
  coverContainer: {
    position: "relative",
  },
  coverImage: {
    width: width,
    height: COVER_HEIGHT,
  },
  bannerImage: {
    width: width,
    height: 120,
    position: "absolute",
    bottom: 0,
    opacity: 0.3,
  },
  coverPlaceholder: {
    width: width,
    height: COVER_HEIGHT,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  coverPlaceholderText: {
    fontSize: 64,
    color: "#6b7280",
    fontWeight: "bold",
  },
  infoSection: {
    padding: 16,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  nativeTitle: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
    flexWrap: "wrap",
  },
  metaBadge: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  metaBadgeText: {
    color: "#818cf8",
    fontSize: 13,
    fontWeight: "bold",
  },
  metaText: {
    color: "#9ca3af",
    fontSize: 13,
    textTransform: "capitalize",
  },
  metaDivider: {
    color: "#4b5563",
    fontSize: 13,
  },
  genresRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 6,
  },
  genreChip: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
  },
  genreChipText: {
    color: "#818cf8",
    fontSize: 12,
  },
  infoLine: {
    color: "#d1d5db",
    fontSize: 14,
    marginTop: 6,
  },
  infoLabel: {
    color: "#6b7280",
  },
  descriptionSection: {
    marginTop: 16,
  },
  description: {
    color: "#d1d5db",
    fontSize: 14,
    lineHeight: 22,
  },
  tagsSection: {
    marginTop: 20,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagChip: {
    backgroundColor: "#252525",
  },
  tagChipText: {
    color: "#9ca3af",
    fontSize: 11,
  },
  addSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 0.5,
    borderTopColor: "#333",
  },
  addSectionSub: {
    color: "#6b7280",
    fontSize: 13,
    marginBottom: 12,
  },
  sourceTabs: {
    maxHeight: 48,
    marginBottom: 12,
  },
  sourceTabsContent: {
    gap: 8,
    alignItems: "center",
  },
  sourceChip: {
    backgroundColor: "#252525",
  },
  sourceResults: {
    marginTop: 8,
  },
  sourceResultsTitle: {
    color: "#9ca3af",
    fontSize: 12,
    marginBottom: 8,
  },
  sourceResultCard: {
    backgroundColor: "#252525",
    marginBottom: 8,
  },
  sourceResultRow: {
    flexDirection: "row",
    padding: 8,
  },
  sourceResultCover: {
    width: 48,
    height: 68,
    borderRadius: 4,
    backgroundColor: "#333",
  },
  sourceResultInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: "center",
  },
  sourceResultTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  sourceResultAuthor: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 2,
  },
  searchingText: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: 8,
  },
  noResultsText: {
    color: "#6b7280",
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
  },
});
