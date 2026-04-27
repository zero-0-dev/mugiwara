import { useState, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  ScrollView,
  StyleSheet,
  Dimensions,
  Pressable,
} from "react-native";
import { router } from "expo-router";
import {
  Searchbar,
  Chip,
  Card,
  Text,
  ActivityIndicator,
} from "react-native-paper";
import { Image } from "expo-image";
import { useDiscoverBrowse } from "@/api/hooks";
import { useDebounce } from "@/hooks/useDebounce";
import { DiscoverManga } from "@/types";

const { width } = Dimensions.get("window");
const NUM_COLUMNS = 2;
const GAP = 8;
const PADDING = 12;
const CARD_WIDTH = (width - PADDING * 2 - GAP) / NUM_COLUMNS;

const CATEGORIES = [
  { label: "Trending", sort: ["TRENDING_DESC"] },
  { label: "Popular", sort: ["POPULARITY_DESC"] },
  { label: "Top Rated", sort: ["SCORE_DESC"] },
  { label: "Favorites", sort: ["FAVOURITES_DESC"] },
  { label: "Newest", sort: ["START_DATE_DESC"] },
  { label: "Recently Updated", sort: ["UPDATED_AT_DESC"] },
  { label: "Popular Manhwa", sort: ["POPULARITY_DESC"], country: "KR" },
  { label: "Popular Manhua", sort: ["POPULARITY_DESC"], country: "CN" },
];

const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Thriller",
];

const FORMATS = [
  { label: "Any", value: "" },
  { label: "Manga", value: "MANGA" },
  { label: "Novel", value: "NOVEL" },
  { label: "One Shot", value: "ONE_SHOT" },
];

const STATUSES = [
  { label: "Any", value: "" },
  { label: "Releasing", value: "RELEASING" },
  { label: "Finished", value: "FINISHED" },
  { label: "Hiatus", value: "HIATUS" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default function DiscoverScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [selectedGenre, setSelectedGenre] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const [showFilters, setShowFilters] = useState(false);

  const filters = {
    sort: activeCategory.sort,
    country: activeCategory.country,
    search: debouncedSearch || undefined,
    genre: selectedGenre || undefined,
    format: selectedFormat || undefined,
    status: selectedStatus || undefined,
    perPage: 20,
  };

  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useDiscoverBrowse(filters);

  const allManga = useMemo(
    () => data?.pages.flatMap((p) => p.manga) ?? [],
    [data],
  );

  const handleMangaPress = useCallback((manga: DiscoverManga) => {
    router.push(`/discover/${manga.id}`);
  }, []);

  const handleCategoryPress = useCallback((cat: typeof CATEGORIES[0]) => {
    setActiveCategory(cat);
    setSelectedGenre("");
    setSelectedFormat("");
    setSelectedStatus("");
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderManga = useCallback(
    ({ item }: { item: DiscoverManga }) => (
      <Card
        style={styles.mangaCard}
        onPress={() => handleMangaPress(item)}
      >
        <View style={styles.cardCover}>
          {item.coverImage?.large ? (
            <Image
              source={{ uri: item.coverImage.large }}
              style={styles.cardImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.cardPlaceholder}>
              <Text style={styles.cardPlaceholderText}>
                {(item.title.english || item.title.romaji).charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {item.averageScore && (
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreText}>{item.averageScore}%</Text>
            </View>
          )}
        </View>
        <Card.Content style={styles.cardContent}>
          <Text numberOfLines={2} style={styles.cardTitle}>
            {item.title.english || item.title.romaji}
          </Text>
          <Text style={styles.cardSubtitle}>
            {item.mediaType} {item.chapters ? `· ${item.chapters} ch` : ""}
          </Text>
        </Card.Content>
      </Card>
    ),
    [handleMangaPress],
  );

  const renderFooter = useCallback(() => {
    if (isFetchingNextPage) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#6366f1" />
        </View>
      );
    }
    if (hasNextPage) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Scroll for more</Text>
        </View>
      );
    }
    if (allManga.length > 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>All results loaded</Text>
        </View>
      );
    }
    return null;
  }, [isFetchingNextPage, hasNextPage, allManga.length]);

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search manga..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchBar}
        inputStyle={styles.searchInput}
        placeholderTextColor="#6b7280"
        iconColor="#6b7280"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryRow}
        contentContainerStyle={styles.categoryRowContent}
      >
        {CATEGORIES.map((cat) => (
          <Chip
            key={cat.label}
            selected={activeCategory.label === cat.label}
            onPress={() => handleCategoryPress(cat)}
            style={styles.categoryChip}
            showSelectedCheck={false}
          >
            {cat.label}
          </Chip>
        ))}
      </ScrollView>

      <Pressable
        onPress={() => setShowFilters(!showFilters)}
        style={styles.filterToggle}
      >
        <Text style={styles.filterToggleText}>
          {showFilters ? "Hide Filters ▲" : "Filters ▼"}
        </Text>
      </Pressable>

      {showFilters && (
        <View style={styles.filtersPanel}>
          <Text style={styles.filterLabel}>Genre</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
          >
            <Chip
              selected={!selectedGenre}
              onPress={() => setSelectedGenre("")}
              style={styles.filterChip}
              showSelectedCheck={false}
              compact
            >
              Any
            </Chip>
            {GENRES.map((genre) => (
              <Chip
                key={genre}
                selected={selectedGenre === genre}
                onPress={() => setSelectedGenre(genre)}
                style={styles.filterChip}
                showSelectedCheck={false}
                compact
              >
                {genre}
              </Chip>
            ))}
          </ScrollView>

          <View style={styles.filterRowStatic}>
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Format</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {FORMATS.map((f) => (
                  <Chip
                    key={f.label}
                    selected={selectedFormat === f.value}
                    onPress={() => setSelectedFormat(f.value)}
                    style={styles.filterChip}
                    showSelectedCheck={false}
                    compact
                  >
                    {f.label}
                  </Chip>
                ))}
              </ScrollView>
            </View>
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Status</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {STATUSES.map((s) => (
                  <Chip
                    key={s.label}
                    selected={selectedStatus === s.value}
                    onPress={() => setSelectedStatus(s.value)}
                    style={styles.filterChip}
                    showSelectedCheck={false}
                    compact
                  >
                    {s.label}
                  </Chip>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      )}

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      )}

      {!isLoading && allManga.length > 0 && (
        <FlatList
          data={allManga}
          renderItem={renderManga}
          keyExtractor={(item) => String(item.id)}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={styles.resultsList}
          columnWrapperStyle={styles.columnWrapper}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          onRefresh={refetch}
          refreshing={isFetching && !isFetchingNextPage}
        />
      )}

      {!isLoading && allManga.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No manga found</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  searchBar: {
    margin: 12,
    backgroundColor: "#252525",
    borderRadius: 8,
  },
  searchInput: {
    color: "#fff",
  },
  categoryRow: {
    maxHeight: 48,
  },
  categoryRowContent: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
  },
  categoryChip: {
    backgroundColor: "#252525",
  },
  filterToggle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterToggleText: {
    color: "#6366f1",
    fontSize: 13,
  },
  filtersPanel: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  filterLabel: {
    color: "#9ca3af",
    fontSize: 12,
    marginBottom: 4,
    marginTop: 8,
  },
  filterRow: {
    maxHeight: 36,
  },
  filterRowStatic: {
    gap: 4,
  },
  filterGroup: {
    marginBottom: 4,
  },
  filterChip: {
    backgroundColor: "#252525",
    marginRight: 6,
  },
  resultsList: {
    padding: PADDING,
    paddingBottom: 48,
  },
  columnWrapper: {
    gap: GAP,
  },
  mangaCard: {
    width: CARD_WIDTH,
    backgroundColor: "#252525",
    marginBottom: GAP,
  },
  cardCover: {
    height: CARD_WIDTH * 1.4,
    backgroundColor: "#333",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: "hidden",
  },
  cardImage: {
    flex: 1,
  },
  cardPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cardPlaceholderText: {
    fontSize: 32,
    color: "#6b7280",
    fontWeight: "bold",
  },
  scoreBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(99, 102, 241, 0.9)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  scoreText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },
  cardContent: {
    padding: 8,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
  },
  cardSubtitle: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 2,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 16,
    textAlign: "center",
  },
});
