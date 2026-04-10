import { View, StyleSheet, ScrollView } from "react-native";
import { router } from "expo-router";
import {
  List,
  Divider,
  Button,
  Portal,
  Dialog,
  TextInput,
  Text,
} from "react-native-paper";
import { useState } from "react";
import { useConfig } from "@/contexts/ConfigContext";
import { apiClient } from "@/api/client";

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
        // Reload the app to use new server
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
    <ScrollView style={styles.container}>
      <List.Section>
        <List.Subheader style={styles.subheader}>Server</List.Subheader>
        <List.Item
          title="Server URL"
          description={serverUrl}
          left={(props) => (
            <List.Icon {...props} icon="server" color="#6366f1" />
          )}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => {
            setNewServerUrl(serverUrl);
            setChangeServerVisible(true);
          }}
          titleStyle={styles.itemTitle}
          descriptionStyle={styles.itemDescription}
        />
      </List.Section>

      <Divider style={styles.divider} />

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
  },
  errorText: {
    color: "#ef4444",
    marginTop: 8,
    fontSize: 12,
  },
});
