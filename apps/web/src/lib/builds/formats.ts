// Build files TapScout cannot install, with what to upload instead (docs/07 A9). Shared by the
// upload form (before any upload) and the API (createBuildUpload), so both say the same thing.

const REASONS: { ext: RegExp; reason: string }[] = [
  {
    ext: /\.aab$/i,
    reason:
      "An .aab is a Play Store upload bundle; devices install APKs. Build a universal APK from it (bundletool build-apks --mode=universal, then unzip universal.apk) or run ./gradlew assembleRelease, and upload the .apk.",
  },
  {
    ext: /\.(apks|xapk|apkm)$/i,
    reason:
      "This is a split-APK set. Upload one universal .apk instead (bundletool build-apks --mode=universal, or ./gradlew assembleRelease).",
  },
  {
    ext: /\.ipa$/i,
    reason:
      "An .ipa is a device build; TapScout runs iOS apps on the Simulator. Build for the Simulator (xcodebuild -sdk iphonesimulator …) and upload a .zip of the .app.",
  },
];

/** Why a file of this name cannot be tested, or null when its type is not a known dead end. */
export function unsupportedBuildReason(fileName: string): string | null {
  return REASONS.find((r) => r.ext.test(fileName.trim()))?.reason ?? null;
}
