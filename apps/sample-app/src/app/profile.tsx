import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text } from "react-native";
import { Body, Button, Card, Screen, Title, useTheme } from "../components/ui";
import { clearProfile, loadProfile, type Profile } from "../lib/profile-store";

export default function ProfileScreen() {
  const t = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadProfile().then(setProfile);
    }, []),
  );

  async function onSignOut() {
    await clearProfile();
    router.replace("/");
  }

  return (
    <Screen testID="profile-screen">
      <Title>{profile ? `Hi, ${profile.name}` : "Profile"}</Title>
      <Card>
        <Text style={{ color: t.muted, fontSize: 13 }}>Email</Text>
        <Text testID="profile-email" style={{ color: t.text, fontSize: 16 }}>
          {profile?.email ?? "—"}
        </Text>
        <Text style={{ color: t.muted, fontSize: 13, marginTop: 8 }}>About</Text>
        <Text testID="profile-bio" style={{ color: t.text, fontSize: 16 }}>
          {profile?.bio || "No bio yet."}
        </Text>
      </Card>
      <Body>Changes are saved on this device.</Body>
      <Button
        testID="profile-edit"
        label="Edit profile"
        onPress={() => router.push("/edit-profile")}
      />
      <Button testID="profile-sign-out" label="Sign out" kind="secondary" onPress={onSignOut} />
    </Screen>
  );
}
