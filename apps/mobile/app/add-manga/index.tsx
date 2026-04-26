import { useState, useEffect } from "react";
import {
  View,
  FlatList,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import {
  Appbar,
  Searchbar,
  Chip,
  Card,
  Text,
  ActivityIndicator,
  Snackbar,
} from "react-native-paper";
import { Image } from "expo-image";
import { useSources, useSearchSource } from "@/api/hooks";
import { useDebounce } from "@/hooks/useDebounce";
import { SearchResult } from "@/types";

const { width } = Dimensions.get("window");
const NUM_COLUMNS = 2;
const GAP = 8;
const PADDING = 12;
const CARD_WIDTH = (width - PADDING * 2 - GAP) / NUM_COLUMNS;

export default function AddMangaSearchScreen() {
  const [query, setQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 300);

  const { data: sources, isLoading: sourcesLoading } = useSources();
  const { data: results, isLoading: resultsLoading } = useSearchSource(
    selectedSource || "",
    debouncedQuery,
  );

  const remoteSources =
    sources?.filter((s) => s.id !== "local") || [];

  useEffect(() => {
    if (!selectedSource && remoteSources.length > 0) {
      setSelectedSource(remoteSources[0].id);
    }
  }, [remoteSources, selectedSource]);

  const handleResultPress = (result: SearchResult) => {
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

  const renderResult = ({ item }: { item: SearchResult }) => (
    <Card
      style={styles.resultCard}
      onPress={() => handleResultPress(item)}
    >
      <View style={styles.cardCover}>
        {item.coverImageUrl ? (
          <Image
            source={{ uri: item.coverImageUrl }}
            style={styles.cardImage}
            contentFit="cover"
          />
        ) : (
          <View style={styles.cardPlaceholder}>
            <Text style={styles.cardPlaceholderText}>
              {item.title.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Card.Content style={styles.cardContent}>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {item.title}
        </Text>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.header}>
        <Appbar.Action icon="close" onPress={() => router.back()} />
        <Appbar.Content title="Add Manga" />
      </Appbar.Header>

      {sourcesLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : remoteSources.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No sources available</Text>
        </View>
      ) : (
        <>
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
                onPress={() => {
                  setSelectedSource(source.id);
                  setQuery("");
                }}
                style={styles.sourceChip}
                showSelectedCheck={false}
              >
                {source.name}
              </Chip>
            ))}
          </ScrollView>

          <Searchbar
            placeholder="Search manga..."
            onChangeText={setQuery}
            value={query}
            style={styles.searchBar}
            inputStyle={styles.searchInput}
            placeholderTextColor="#6b7280"
            iconColor="#6b7280"
            autoFocus
          />

          {resultsLoading && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#6366f1" />
            </View>
          )}

          {!resultsLoading &&
            debouncedQuery.length > 0 &&
            debouncedQuery.length < 2 && (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>
                  Type at least 2 characters to search
                </Text>
              </View>
            )}

          {!resultsLoading &&
            debouncedQuery.length === 0 && (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>
                  Search for manga to add to your library
                </Text>
              </View>
            )}

          {!resultsLoading &&
            debouncedQuery.length >= 2 &&
            results?.length === 0 && (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>
                  No manga found for "{debouncedQuery}"
                </Text>
              </View>
            )}

          {!resultsLoading && results && results.length > 0 && (
            <FlatList
              data={results}
              renderItem={renderResult}
              keyExtractor={(item) => item.sourceMangaId}
              numColumns={NUM_COLUMNS}
              contentContainerStyle={styles.resultsList}
              columnWrapperStyle={styles.columnWrapper}
              ListFooterComponent={
                <View style={styles.resultCount}>
                  <Text style={styles.resultCountText}>
                    {results.length} manga found for "{debouncedQuery}"
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}

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
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  sourceTabs: {
    maxHeight: 48,
    marginVertical: 4,
  },
  sourceTabsContent: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
  },
  sourceChip: {
    backgroundColor: "#252525",
  },
  searchBar: {
    margin: 12,
    backgroundColor: "#252525",
    borderRadius: 8,
  },
  searchInput: {
    color: "#fff",
  },
  resultsList: {
    padding: PADDING,
    paddingBottom: 48,
  },
  columnWrapper: {
    gap: GAP,
  },
  resultCard: {
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
  cardContent: {
    padding: 8,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
  },
  resultCount: {
    alignItems: "center",
    paddingVertical: 12,
  },
  resultCountText: {
    color: "#6b7280",
    fontSize: 12,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 16,
    textAlign: "center",
  },
});
