import { View, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import {
  List,
  Divider,
  Button,
  Portal,
  Dialog,
  TextInput,
  Text,
  Switch,
  RadioButton,
  Searchbar,
  ActivityIndicator,
} from "react-native-paper";
import { useState } from "react";
import { useConfig } from "@/contexts/ConfigContext";
import { apiClient } from "@/api/client";
import {
  useSettings,
  useUpdateSetting,
  useStorageBackends,
  useStorageTypes,
  useCreateStorageBackend,
  useUpdateStorageBackend,
  useDeleteStorageBackend,
  useScanStorage,
  useInstalledPlugins,
  useAvailablePlugins,
  useInstallPlugin,
  useUninstallPlugin,
  useEnablePlugin,
  useDisablePlugin,
} from "@/api/hooks";
import { StorageBackend, Plugin } from "@/types";

const READING_MODES = [
  { value: "rtl", label: "Right to Left", description: "Traditional manga" },
  { value: "ltr", label: "Left to Right", description: "Western comics" },
  { value: "vertical", label: "Vertical", description: "Webtoon style" },
];

const MEDIA_TYPES = [
  { key: "manga", label: "Manga", description: "Japanese" },
  { key: "manhwa", label: "Manhwa", description: "Korean" },
  { key: "manhua", label: "Manhua", description: "Chinese" },
  { key: "webtoon", label: "Webtoon", description: "Digital comics" },
];

export default function SettingsScreen() {
  const { serverUrl, setServerUrl, testConnection } = useConfig();
  const [changeServerVisible, setChangeServerVisible] = useState(false);
  const [newServerUrl, setNewServerUrl] = useState(serverUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState("");

  const handleChangeServer = async () => {
    if (!newServerUrl.trim()) {
      setError("Please enter a server URL");
      return;
    }

    setError("");
    setIsTesting(true);

    try {
      let formattedUrl = newServerUrl.trim();
      if (
        !formattedUrl.startsWith("http://") &&
        !formattedUrl.startsWith("https://")
      ) {
        formattedUrl = `http://${formattedUrl}`;
      }

      const isValid = await testConnection(formattedUrl);

      if (isValid) {
        await setServerUrl(formattedUrl);
        setChangeServerVisible(false);
        router.replace("/");
      } else {
        setError("Could not connect to server. Please check the URL.");
      }
    } catch {
      setError("Connection failed. Please check the URL.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1a1a" }}>
      <ScrollView style={styles.container}>
        <ServerSection
          serverUrl={serverUrl}
          onChangePress={() => {
            setNewServerUrl(serverUrl);
            setChangeServerVisible(true);
          }}
        />
        <ReadingSection />
        <StorageSection />
        <PluginsSection />
        <AboutSection />

        <Portal>
          <Dialog
            visible={changeServerVisible}
            onDismiss={() => setChangeServerVisible(false)}
            style={{ backgroundColor: "#252525" }}
          >
            <Dialog.Title style={{ color: "#fff" }}>Change Server</Dialog.Title>
            <Dialog.Content>
              <TextInput
                label="Server URL"
                value={newServerUrl}
                onChangeText={setNewServerUrl}
                placeholder="http://192.168.1.100:3001"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.input}
                textColor="#fff"
                theme={{ colors: { onSurfaceVariant: "#9ca3af" } }}
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </Dialog.Content>
            <Dialog.Actions>
              <Button
                onPress={() => setChangeServerVisible(false)}
                textColor="#d1d5db"
              >
                Cancel
              </Button>
              <Button
                onPress={handleChangeServer}
                loading={isTesting}
                disabled={isTesting}
                textColor="#6366f1"
              >
                Connect
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </ScrollView>
    </View>
  );
}

function ServerSection({
  serverUrl,
  onChangePress,
}: {
  serverUrl: string;
  onChangePress: () => void;
}) {
  return (
    <>
      <List.Section>
        <List.Subheader style={styles.subheader}>Server</List.Subheader>
        <List.Item
          title="Server URL"
          description={serverUrl}
          left={(props) => (
            <List.Icon {...props} icon="server" color="#6366f1" />
          )}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={onChangePress}
          titleStyle={styles.itemTitle}
          descriptionStyle={styles.itemDescription}
        />
      </List.Section>
      <Divider style={styles.divider} />
    </>
  );
}

function ReadingSection() {
  const { data: settings, isLoading } = useSettings();
  const updateSetting = useUpdateSetting();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedValue, setSelectedValue] = useState<string>("");

  if (isLoading) {
    return (
      <List.Section>
        <List.Subheader style={styles.subheader}>Reading</List.Subheader>
        <ActivityIndicator style={{ padding: 16 }} color="#6366f1" />
      </List.Section>
    );
  }

  const currentMode = (key: string) => settings?.[key] || "rtl";

  const readingModesList = [
    {
      key: "reading.defaultMode",
      label: "Default Reading Mode",
      description: "Used when no specific mode is set",
    },
    ...MEDIA_TYPES.map((mt) => ({
      key: `reading.${mt.key}Mode`,
      label: mt.label,
      description: mt.description,
    })),
  ];

  return (
    <>
      <List.Section>
        <List.Subheader style={styles.subheader}>Reading</List.Subheader>
        {readingModesList.map((item) => (
          <List.Item
            key={item.key}
            title={item.label}
            description={item.description}
            left={(props) => (
              <List.Icon {...props} icon="book-open-variant" color="#6366f1" />
            )}
            right={(props) => (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ color: "#6366f1", marginRight: 8 }}>
                  {currentMode(item.key).toUpperCase()}
                </Text>
                <List.Icon {...props} icon="chevron-right" />
              </View>
            )}
            onPress={() => {
              setSelectedKey(item.key);
              setSelectedValue(currentMode(item.key));
            }}
            titleStyle={styles.itemTitle}
            descriptionStyle={styles.itemDescription}
          />
        ))}
      </List.Section>
      <Divider style={styles.divider} />

      <Portal>
        <Dialog
          visible={selectedKey !== null}
          onDismiss={() => setSelectedKey(null)}
          style={{ backgroundColor: "#252525" }}
        >
          <Dialog.Title style={{ color: "#fff" }}>
            {readingModesList.find((r) => r.key === selectedKey)?.label ||
              "Reading Mode"}
          </Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              onValueChange={setSelectedValue}
              value={selectedValue}
            >
              {READING_MODES.map((mode) => (
                <TouchableOpacity
                  key={mode.value}
                  onPress={() => setSelectedValue(mode.value)}
                  style={styles.radioRow}
                >
                  <RadioButton value={mode.value} color="#6366f1" />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={{ color: "#fff" }}>{mode.label}</Text>
                    <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                      {mode.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSelectedKey(null)} textColor="#d1d5db">
              Cancel
            </Button>
            <Button
              onPress={() => {
                if (selectedKey) {
                  updateSetting.mutate({
                    key: selectedKey,
                    value: selectedValue,
                  });
                }
                setSelectedKey(null);
              }}
              textColor="#6366f1"
              loading={updateSetting.isPending}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

function StorageSection() {
  const { data: backends, isLoading: loadingBackends } = useStorageBackends();
  const { data: storageTypes } = useStorageTypes();
  const createBackend = useCreateStorageBackend();
  const updateBackend = useUpdateStorageBackend();
  const deleteBackend = useDeleteStorageBackend();
  const scanStorage = useScanStorage();

  const [showCreate, setShowCreate] = useState(false);
  const [editingBackend, setEditingBackend] = useState<StorageBackend | null>(
    null,
  );
  const [deletingBackend, setDeletingBackend] = useState<StorageBackend | null>(
    null,
  );
  const [scanResult, setScanResult] = useState<{
    added: number;
    updated: number;
    errors: string[];
  } | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("");
  const [formConfig, setFormConfig] = useState("{}");
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setFormName("");
    setFormType(storageTypes?.[0] || "");
    setFormConfig("{}");
    setFormIsDefault(false);
  };

  const handleCreate = () => {
    try {
      const config = JSON.parse(formConfig);
      createBackend.mutate(
        { name: formName, type: formType, config, isDefault: formIsDefault },
        {
          onSuccess: () => {
            setShowCreate(false);
            resetForm();
          },
        },
      );
    } catch {
      setError("Invalid JSON config");
    }
  };

  const handleUpdate = () => {
    if (!editingBackend) return;
    try {
      const config = JSON.parse(formConfig);
      updateBackend.mutate(
        {
          id: editingBackend.id,
          data: { name: formName, config, isDefault: formIsDefault },
        },
        {
          onSuccess: () => {
            setEditingBackend(null);
          },
        },
      );
    } catch {
      setError("Invalid JSON config");
    }
  };

  return (
    <>
      <List.Section>
        <List.Subheader style={styles.subheader}>Storage</List.Subheader>

        {loadingBackends ? (
          <ActivityIndicator style={{ padding: 16 }} color="#6366f1" />
        ) : (
          <>
            {backends?.map((backend) => (
              <List.Item
                key={backend.id}
                title={backend.name}
                description={`${backend.type}${backend.isDefault ? " (default)" : ""}`}
                left={(props) => (
                  <List.Icon {...props} icon="harddisk" color="#6366f1" />
                )}
                right={(props) => (
                  <View style={{ flexDirection: "row" }}>
                    <Button
                      compact
                      textColor="#6366f1"
                      onPress={() => {
                        setEditingBackend(backend);
                        setFormName(backend.name);
                        setFormType(backend.type);
                        setFormConfig(JSON.stringify(backend.config, null, 2));
                        setFormIsDefault(backend.isDefault);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      compact
                      textColor="#ef4444"
                      onPress={() => setDeletingBackend(backend)}
                    >
                      Del
                    </Button>
                  </View>
                )}
                titleStyle={styles.itemTitle}
                descriptionStyle={styles.itemDescription}
              />
            ))}

            <Button
              mode="outlined"
              onPress={() => {
                resetForm();
                setShowCreate(true);
              }}
              textColor="#6366f1"
              style={styles.actionButton}
              icon="plus"
            >
              Add Storage Backend
            </Button>

            <Button
              mode="outlined"
              onPress={() =>
                scanStorage.mutate(undefined, {
                  onSuccess: (result) => setScanResult(result),
                })
              }
              textColor="#6366f1"
              style={styles.actionButton}
              icon="magnify-scan"
              loading={scanStorage.isPending}
            >
              Scan Storage
            </Button>

            {scanResult && (
              <View style={styles.scanResult}>
                <Text style={{ color: "#22c55e" }}>
                  Added: {scanResult.added}
                </Text>
                <Text style={{ color: "#6366f1" }}>
                  Updated: {scanResult.updated}
                </Text>
                {scanResult.errors.length > 0 && (
                  <Text style={{ color: "#ef4444", fontSize: 12 }}>
                    Errors: {scanResult.errors.length}
                  </Text>
                )}
                <Button
                  compact
                  textColor="#9ca3af"
                  onPress={() => setScanResult(null)}
                >
                  Dismiss
                </Button>
              </View>
            )}
          </>
        )}
      </List.Section>
      <Divider style={styles.divider} />

      <Portal>
        <Dialog
          visible={showCreate}
          onDismiss={() => setShowCreate(false)}
          style={{ backgroundColor: "#252525" }}
        >
          <Dialog.Title style={{ color: "#fff" }}>
            Add Storage Backend
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Name"
              value={formName}
              onChangeText={setFormName}
              style={styles.input}
              textColor="#fff"
              theme={{ colors: { onSurfaceVariant: "#9ca3af" } }}
            />
            <TextInput
              label="Type"
              value={formType}
              onChangeText={setFormType}
              style={styles.input}
              textColor="#fff"
              theme={{ colors: { onSurfaceVariant: "#9ca3af" } }}
              placeholder={storageTypes?.join(", ")}
            />
            <TextInput
              label="Config (JSON)"
              value={formConfig}
              onChangeText={setFormConfig}
              style={styles.input}
              textColor="#fff"
              theme={{ colors: { onSurfaceVariant: "#9ca3af" } }}
              multiline
              numberOfLines={3}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.switchRow}>
              <Text style={{ color: "#fff" }}>Set as default</Text>
              <Switch
                value={formIsDefault}
                onValueChange={setFormIsDefault}
                color="#6366f1"
              />
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowCreate(false)} textColor="#d1d5db">
              Cancel
            </Button>
            <Button
              onPress={handleCreate}
              textColor="#6366f1"
              loading={createBackend.isPending}
            >
              Create
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={editingBackend !== null}
          onDismiss={() => setEditingBackend(null)}
          style={{ backgroundColor: "#252525" }}
        >
          <Dialog.Title style={{ color: "#fff" }}>
            Edit Storage Backend
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Name"
              value={formName}
              onChangeText={setFormName}
              style={styles.input}
              textColor="#fff"
              theme={{ colors: { onSurfaceVariant: "#9ca3af" } }}
            />
            <TextInput
              label="Type"
              value={formType}
              style={styles.input}
              textColor="#9ca3af"
              theme={{ colors: { onSurfaceVariant: "#9ca3af" } }}
              disabled
            />
            <TextInput
              label="Config (JSON)"
              value={formConfig}
              onChangeText={setFormConfig}
              style={styles.input}
              textColor="#fff"
              theme={{ colors: { onSurfaceVariant: "#9ca3af" } }}
              multiline
              numberOfLines={3}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.switchRow}>
              <Text style={{ color: "#fff" }}>Set as default</Text>
              <Switch
                value={formIsDefault}
                onValueChange={setFormIsDefault}
                color="#6366f1"
              />
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditingBackend(null)} textColor="#d1d5db">
              Cancel
            </Button>
            <Button
              onPress={handleUpdate}
              textColor="#6366f1"
              loading={updateBackend.isPending}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={deletingBackend !== null}
          onDismiss={() => setDeletingBackend(null)}
          style={{ backgroundColor: "#252525" }}
        >
          <Dialog.Title style={{ color: "#fff" }}>Delete Backend</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: "#d1d5db" }}>
              Are you sure you want to delete "{deletingBackend?.name}"?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setDeletingBackend(null)}
              textColor="#d1d5db"
            >
              Cancel
            </Button>
            <Button
              onPress={() => {
                if (deletingBackend) {
                  deleteBackend.mutate(deletingBackend.id, {
                    onSuccess: () => setDeletingBackend(null),
                  });
                }
              }}
              textColor="#ef4444"
              loading={deleteBackend.isPending}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

function PluginsSection() {
  const { data: installed, isLoading: loadingInstalled } =
    useInstalledPlugins();
  const { data: available, isLoading: loadingAvailable } =
    useAvailablePlugins();
  const installPlugin = useInstallPlugin();
  const uninstallPlugin = useUninstallPlugin();
  const enablePlugin = useEnablePlugin();
  const disablePlugin = useDisablePlugin();

  const [searchQuery, setSearchQuery] = useState("");
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);

  const filteredAvailable = (available || []).filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !(installed || []).find((i) => i.id === p.name),
  );

  return (
    <>
      <List.Section>
        <List.Subheader style={styles.subheader}>Plugins</List.Subheader>

        {loadingInstalled ? (
          <ActivityIndicator style={{ padding: 16 }} color="#6366f1" />
        ) : (
          <>
            <Text
              style={{
                color: "#9ca3af",
                fontSize: 13,
                paddingHorizontal: 16,
                paddingBottom: 8,
              }}
            >
              Installed Plugins
            </Text>
            {(installed || []).length === 0 ? (
              <Text
                style={{
                  color: "#6b7280",
                  paddingHorizontal: 16,
                  paddingBottom: 8,
                }}
              >
                No plugins installed.
              </Text>
            ) : (
              (installed || []).map((plugin: Plugin) => (
                <List.Item
                  key={plugin.id}
                  title={plugin.id}
                  description={`${plugin.type} v${plugin.version} — ${plugin.isEnabled ? "Enabled" : "Disabled"}${plugin.isBuiltin ? " (built-in)" : ""}`}
                  left={(props) => (
                    <List.Icon
                      {...props}
                      icon="puzzle"
                      color={plugin.isEnabled ? "#6366f1" : "#6b7280"}
                    />
                  )}
                  right={(props) => (
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      {!plugin.isBuiltin && (
                        <>
                          <Button
                            compact
                            textColor={plugin.isEnabled ? "#ef4444" : "#22c55e"}
                            onPress={() =>
                              plugin.isEnabled
                                ? disablePlugin.mutate(plugin.id)
                                : enablePlugin.mutate(plugin.id)
                            }
                          >
                            {plugin.isEnabled ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            compact
                            textColor="#ef4444"
                            onPress={() => setConfirmUninstall(plugin.id)}
                          >
                            Uninstall
                          </Button>
                        </>
                      )}
                    </View>
                  )}
                  titleStyle={styles.itemTitle}
                  descriptionStyle={styles.itemDescription}
                />
              ))
            )}
          </>
        )}

        <Text
          style={{
            color: "#9ca3af",
            fontSize: 13,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 8,
          }}
        >
          Available Plugins
        </Text>
        <Searchbar
          placeholder="Search plugins..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchbar}
          inputStyle={{ color: "#fff" }}
          iconColor="#9ca3af"
          placeholderTextColor="#6b7280"
        />

        {loadingAvailable ? (
          <ActivityIndicator style={{ padding: 16 }} color="#6366f1" />
        ) : (
          <>
            {(filteredAvailable || []).length === 0 ? (
              <Text
                style={{
                  color: "#6b7280",
                  paddingHorizontal: 16,
                  paddingBottom: 8,
                }}
              >
                {searchQuery
                  ? "No plugins match your search."
                  : "No available plugins found."}
              </Text>
            ) : (
              (filteredAvailable || []).slice(0, 10).map((plugin) => (
                <List.Item
                  key={plugin.name}
                  title={plugin.name}
                  description={`v${plugin.version}${plugin.description ? ` — ${plugin.description}` : ""}`}
                  left={(props) => (
                    <List.Icon {...props} icon="download" color="#6366f1" />
                  )}
                  right={(props) => (
                    <Button
                      compact
                      textColor="#6366f1"
                      onPress={() =>
                        installPlugin.mutate({ packageName: plugin.name })
                      }
                      loading={
                        installPlugin.isPending &&
                        installPlugin.variables?.packageName === plugin.name
                      }
                    >
                      Install
                    </Button>
                  )}
                  titleStyle={styles.itemTitle}
                  descriptionStyle={styles.itemDescription}
                />
              ))
            )}
            {(filteredAvailable || []).length > 10 && (
              <Text
                style={{
                  color: "#6b7280",
                  paddingHorizontal: 16,
                  fontSize: 12,
                }}
              >
                Showing 10 of {filteredAvailable.length} results
              </Text>
            )}
          </>
        )}
      </List.Section>
      <Divider style={styles.divider} />

      <Portal>
        <Dialog
          visible={confirmUninstall !== null}
          onDismiss={() => setConfirmUninstall(null)}
          style={{ backgroundColor: "#252525" }}
        >
          <Dialog.Title style={{ color: "#fff" }}>
            Uninstall Plugin
          </Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: "#d1d5db" }}>
              Are you sure you want to uninstall "{confirmUninstall}"? Server
              restart may be required.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setConfirmUninstall(null)}
              textColor="#d1d5db"
            >
              Cancel
            </Button>
            <Button
              onPress={() => {
                if (confirmUninstall) {
                  uninstallPlugin.mutate(confirmUninstall, {
                    onSuccess: () => setConfirmUninstall(null),
                  });
                }
              }}
              textColor="#ef4444"
              loading={uninstallPlugin.isPending}
            >
              Uninstall
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

function AboutSection() {
  return (
    <List.Section>
      <List.Subheader style={styles.subheader}>About</List.Subheader>
      <List.Item
        title="Mugiwara Mobile"
        description="Version 1.0.0"
        left={(props) => (
          <List.Icon {...props} icon="information" color="#6366f1" />
        )}
        titleStyle={styles.itemTitle}
        descriptionStyle={styles.itemDescription}
      />
    </List.Section>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  subheader: {
    color: "#6366f1",
    fontWeight: "bold",
  },
  itemTitle: {
    color: "#fff",
  },
  itemDescription: {
    color: "#9ca3af",
  },
  divider: {
    backgroundColor: "#333333",
    marginHorizontal: 16,
  },
  input: {
    backgroundColor: "#333333",
    marginBottom: 12,
  },
  errorText: {
    color: "#ef4444",
    marginTop: 8,
    fontSize: 12,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  actionButton: {
    marginHorizontal: 16,
    marginTop: 8,
    borderColor: "#6366f1",
  },
  scanResult: {
    backgroundColor: "#252525",
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    gap: 4,
  },
  searchbar: {
    backgroundColor: "#333333",
    marginHorizontal: 16,
    marginBottom: 8,
  },
});
