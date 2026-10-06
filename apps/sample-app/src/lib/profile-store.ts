import AsyncStorage from "@react-native-async-storage/async-storage";

/** Local-only storage: resetting app data fully resets the sample (no remote backend). */
export interface Profile {
  name: string;
  email: string;
  bio: string;
}

const KEY = "fieldnotes.profile.v1";

export async function loadProfile(): Promise<Profile | null> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Profile) : null;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}

export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
