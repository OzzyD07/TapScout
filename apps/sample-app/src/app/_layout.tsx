import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: "FieldNotes" }} />
        <Stack.Screen name="register" options={{ title: "Create profile" }} />
        <Stack.Screen name="profile" options={{ title: "Profile", headerBackVisible: false }} />
        <Stack.Screen name="edit-profile" options={{ title: "Edit profile" }} />
      </Stack>
    </>
  );
}
