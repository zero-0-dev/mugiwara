import { View, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { Text, ActivityIndicator, Chip } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCategories, useLibrary } from "@/api/hooks";
import { Category } from "@/types";

export default function CategoriesScreen() {
  const { data: categories, isLoading } = useCategories();
  const { data: library } = useLibrary();

  const getCategoryCount = (categoryId: string) => {
    return (
      library?.filter(
        (manga) =>
          // This is a simplified count - ideally we'd have a dedicated endpoint
          // For now, we'll show the category without count
          true,
      ).length || 0
    );
  };

  const handleCategoryPress = (category: Category) => {
    // Navigate to library with category filter
    router.push({
      pathname: "/(tabs)/library",
      params: { category: category.id },
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        Categories
      </Text>

      {categories && categories.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="tag-off" size={48} color="#6b7280" />
          <Text style={styles.emptyText}>No categories yet</Text>
          <Text style={styles.emptySubtext}>
            Categories are managed on the server
          </Text>
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.categoryItem}
              onPress={() => handleCategoryPress(item)}
            >
              <View
                style={[
                  styles.colorIndicator,
                  { backgroundColor: item.color || "#6366f1" },
                ]}
              />
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryName}>{item.name}</Text>
                <Text style={styles.categoryCount}>Tap to filter library</Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color="#6b7280"
              />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
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
  title: {
    color: "#fff",
    fontWeight: "bold",
    padding: 16,
    paddingBottom: 8,
  },
  list: {
    padding: 16,
  },
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#252525",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  categoryCount: {
    color: "#9ca3af",
    fontSize: 14,
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 8,
  },
});
