import { View, FlatList, StyleSheet } from "react-native";
import {
  Text,
  ActivityIndicator,
  ProgressBar,
  IconButton,
  Card,
  Chip,
  Button,
} from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  useQueueTasks,
  useQueueStats,
  useCancelTask,
  useRetryTask,
  useRetryAllFailed,
  useClearCompleted,
} from "@/api/hooks";
import { ImportTask } from "@/types";

function QueueActions({
  hasErrors,
  hasCompleted,
}: {
  hasErrors: boolean;
  hasCompleted: boolean;
}) {
  const retryAllFailed = useRetryAllFailed();
  const clearCompleted = useClearCompleted();

  return (
    <View style={styles.actionsContainer}>
      {hasErrors && (
        <Button
          mode="outlined"
          onPress={() => retryAllFailed.mutate()}
          loading={retryAllFailed.isPending}
          textColor="#6366f1"
          style={styles.actionButton}
          icon="refresh"
        >
          Retry All Failed
        </Button>
      )}
      {hasCompleted && (
        <Button
          mode="outlined"
          onPress={() => clearCompleted.mutate()}
          loading={clearCompleted.isPending}
          textColor="#6366f1"
          style={styles.actionButton}
          icon="check-all"
        >
          Clear Completed
        </Button>
      )}
    </View>
  );
}

function TaskItem({ task }: { task: ImportTask }) {
  const cancelTask = useCancelTask();
  const retryTask = useRetryTask();

  const getStatusColor = (status: ImportTask["status"]) => {
    switch (status) {
      case "running":
        return "#6366f1";
      case "complete":
        return "#22c55e";
      case "error":
        return "#ef4444";
      case "pending":
        return "#9ca3af";
      default:
        return "#6b7280";
    }
  };

  const getStatusIcon = (status: ImportTask["status"]) => {
    switch (status) {
      case "running":
        return "loading";
      case "complete":
        return "check-circle";
      case "error":
        return "alert-circle";
      case "pending":
        return "clock-outline";
      default:
        return "help-circle";
    }
  };

  return (
    <Card style={styles.taskCard}>
      <Card.Content>
        <View style={styles.taskHeader}>
          <View style={styles.taskInfo}>
            <MaterialCommunityIcons
              name={getStatusIcon(task.status)}
              size={20}
              color={getStatusColor(task.status)}
            />
            <View style={styles.taskText}>
              <Text style={styles.taskType}>
                {task.type === "chapter" ? "Chapter" : "Full Manga"}
              </Text>
              <Chip
                style={[
                  styles.statusChip,
                  { backgroundColor: `${getStatusColor(task.status)}20` },
                ]}
                textStyle={{ color: getStatusColor(task.status) }}
              >
                {task.status}
              </Chip>
            </View>
          </View>
          <View style={styles.taskActions}>
            {task.status === "error" && (
              <IconButton
                icon="refresh"
                size={20}
                onPress={() => retryTask.mutate(task.id)}
                iconColor="#6366f1"
              />
            )}
            {(task.status === "pending" || task.status === "running") && (
              <IconButton
                icon="close"
                size={20}
                onPress={() => cancelTask.mutate(task.id)}
                iconColor="#ef4444"
              />
            )}
          </View>
        </View>

        {(task.status === "running" || task.status === "complete") && (
          <View style={styles.progressContainer}>
            <ProgressBar
              progress={task.progressPercent / 100}
              color={getStatusColor(task.status)}
              style={styles.progressBar}
            />
            <Text style={styles.progressText}>
              {Math.round(task.progressPercent)}%
            </Text>
          </View>
        )}

        {task.errorMessage && (
          <Text style={styles.errorText}>{task.errorMessage}</Text>
        )}
      </Card.Content>
    </Card>
  );
}

export default function QueueScreen() {
  const { data: tasks, isLoading: tasksLoading } = useQueueTasks();
  const { data: stats, isLoading: statsLoading } = useQueueStats();

  const isLoading = tasksLoading || statsLoading;

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
        Download Queue
      </Text>

      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: "#6366f1" }]}>
              {stats.running}
            </Text>
            <Text style={styles.statLabel}>Running</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: "#22c55e" }]}>
              {stats.complete}
            </Text>
            <Text style={styles.statLabel}>Complete</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: "#ef4444" }]}>
              {stats.error}
            </Text>
            <Text style={styles.statLabel}>Error</Text>
          </View>
        </View>
      )}

      {stats && (stats.error > 0 || stats.complete > 0) && (
        <QueueActions
          hasErrors={stats.error > 0}
          hasCompleted={stats.complete > 0}
        />
      )}

      {tasks && tasks.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name="check-circle-outline"
            size={48}
            color="#6b7280"
          />
          <Text style={styles.emptyText}>Queue is empty</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <TaskItem task={item} />}
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
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 16,
    backgroundColor: "#252525",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
  },
  statLabel: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 4,
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  taskCard: {
    backgroundColor: "#252525",
    marginBottom: 8,
  },
  taskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  taskInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  taskText: {
    gap: 4,
  },
  taskType: {
    color: "#fff",
    fontWeight: "500",
  },
  statusChip: {
    alignSelf: "flex-start",
  },
  taskActions: {
    flexDirection: "row",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  progressText: {
    color: "#9ca3af",
    fontSize: 12,
    minWidth: 35,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    marginTop: 8,
  },
  actionsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  actionButton: {
    borderColor: "#6366f1",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 16,
    marginTop: 16,
  },
});
