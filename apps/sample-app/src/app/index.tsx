import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Body, Button, Screen, Title } from "../components/ui";
import { loadProfile } from "../lib/profile-store";

export default function Welcome() {
  const [state, setState] = useState<"loading" | "new" | "existing">("loading");

  useEffect(() => {
    loadProfile().then((p) => setState(p ? "existing" : "new"));
  }, []);

  if (state === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  if (state === "existing") return <Redirect href="/profile" />;

  return (
    <Screen testID="welcome-screen">
      <Title>Welcome to FieldNotes</Title>
      <Body>Keep short notes from the field and share a simple profile with your team.</Body>
      <Button
        testID="welcome-get-started"
        label="Get started"
        onPress={() => router.push("/register")}
      />
    </Screen>
  );
}
