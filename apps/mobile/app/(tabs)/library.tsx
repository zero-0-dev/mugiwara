import { useState, useCallback } from "react";
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import {
  Searchbar,
  Menu,
  Button,
  Text,
  ActivityIndicator,
  IconButton,
  FAB,
} from "react-native-paper";
import { useLibrary, useFilterOptions } from "@/api/hooks";
import { MangaCard } from "@/components/MangaCard";
import { Manga } from "@/types";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const ITEM_WIDTH = (width - 32 - (NUM_COLUMNS - 1) * 8) / NUM_COLUMNS;
const ITEM_HEIGHT = ITEM_WIDTH * 1.5 + 50;

export default function LibraryScreen() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("lastRead");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [status, setStatus] = useState<string | undefined>();
  const [mediaType, setMediaType] = useState<string | undefined>();
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);

  const handleAddManga = () => {
    router.push("/add-manga" as any);
  };

  const {
    data: manga,
    isLoading,
    refetch,
  } = useLibrary(
    search || undefined,
    status,
    mediaType,
    undefined,
    undefined,
    undefined,
    sortBy,
    sortOrder,
  );
  const { data: filterOptions } = useFilterOptions();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleMangaPress = (manga: Manga) => {
    router.push(`/manga/${manga.id}`);
  };

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const renderItem = ({ item }: { item: Manga }) => (
    <MangaCard
      manga={item}
      onPress={() => handleMangaPress(item)}
      width={ITEM_WIDTH}
    />
  );

  if (isLoading && !manga) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <Searchbar
          placeholder="Search manga..."
          onChangeText={setSearch}
          value={search}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          placeholderTextColor="#6b7280"
          iconColor="#6b7280"
        />

        <View style={styles.filterBar}>
          <Menu
            visible={filterMenuVisible}
            onDismiss={() => setFilterMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setFilterMenuVisible(true)}
                style={styles.filterButton}
                textColor="#d1d5db"
              >
                Filters
              </Button>
            }
          >
            <Menu.Item
              onPress={() => {
                setStatus(undefined);
                setMediaType(undefined);
                setFilterMenuVisible(false);
              }}
              title="All"
            />
            <Menu.Item
              onPress={() => {
                setStatus("ongoing");
                setFilterMenuVisible(false);
              }}
              title="Ongoing"
            />
            <Menu.Item
              onPress={() => {
                setStatus("completed");
                setFilterMenuVisible(false);
              }}
              title="Completed"
            />
          </Menu>

          <Menu
            visible={sortMenuVisible}
            onDismiss={() => setSortMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setSortMenuVisible(true)}
                style={styles.filterButton}
                textColor="#d1d5db"
              >
                Sort
              </Button>
            }
          >
            <Menu.Item
              onPress={() => {
                setSortBy("lastRead");
                setSortMenuVisible(false);
              }}
              title="Last Read"
            />
            <Menu.Item
              onPress={() => {
                setSortBy("title");
                setSortMenuVisible(false);
              }}
              title="Title"
            />
            <Menu.Item
              onPress={() => {
                setSortBy("dateAdded");
                setSortMenuVisible(false);
              }}
              title="Date Added"
            />
          </Menu>

          <IconButton
            icon={sortOrder === "asc" ? "sort-ascending" : "sort-descending"}
            size={20}
            onPress={toggleSortOrder}
            iconColor="#d1d5db"
          />
        </View>

        <FlatList
          data={manga || []}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={styles.list}
          columnWrapperStyle={styles.columnWrapper}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor="#6366f1"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No manga found</Text>
            </View>
          }
        />
        <FAB
          icon="plus"
          color="#fff"
          style={styles.fab}
          onPress={handleAddManga}
        />
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
  searchBar: {
    margin: 8,
    backgroundColor: "#252525",
    borderRadius: 8,
  },
  searchInput: {
    color: "#fff",
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 8,
  },
  filterButton: {
    borderColor: "#374151",
  },
  list: {
    padding: 8,
    paddingBottom: 100,
  },
  columnWrapper: {
    gap: 8,
    marginBottom: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 16,
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: "#6366f1",
  },
});
