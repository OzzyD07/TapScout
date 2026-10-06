import { router } from "expo-router";
import { useState } from "react";
import { Body, Button, Field, Screen, Title } from "../components/ui";
import { saveProfile, validateEmail } from "../lib/profile-store";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [saving, setSaving] = useState(false);

  async function onContinue() {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Enter your name.";
    if (!validateEmail(email)) next.email = "Enter a valid email address.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    await saveProfile({ name: name.trim(), email: email.trim(), bio: "" });
    setSaving(false);
    router.replace("/profile");
  }

  return (
    <Screen testID="register-screen">
      <Title>Create your profile</Title>
      <Body>Your profile is stored only on this device.</Body>
      <Field
        testID="register-name"
        label="Name"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        error={errors.name}
        returnKeyType="next"
      />
      <Field
        testID="register-email"
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={errors.email}
        returnKeyType="done"
      />
      <Button testID="register-continue" label="Continue" onPress={onContinue} disabled={saving} />
    </Screen>
  );
}
