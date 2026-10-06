import { z } from "zod";
import { Platform } from "./enums.js";

export const Id = z.string().min(1).max(128);
export const Uuid = z.uuid();
export const Timestamp = z.iso.datetime({ offset: true });
export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/, "lowercase hex sha-256");

/** Rectangle in screenshot pixel space. Convert with `ScreenGeometry.scale` for dp/pt. */
export const Bounds = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
});
export type Bounds = z.infer<typeof Bounds>;

/** Agent, prompt, check/rule pack, budget and model identities attached to every run output. */
export const VersionStamp = z.object({
  agent: z.string(),
  prompt: z.string(),
  checkPack: z.string(),
  rulePack: z.string(),
  budget: z.string(),
  plannerModel: z.string(),
  visionModel: z.string().optional(),
});
export type VersionStamp = z.infer<typeof VersionStamp>;

export const DeviceProfile = z.object({
  platform: Platform,
  /** e.g. "Android Emulator" or "iOS Simulator" — iOS evidence is always labelled Simulator. */
  environment: z.enum(["android_emulator", "ios_simulator"]),
  osVersion: z.string(),
  deviceName: z.string(),
  abi: z.string().optional(),
  automation: z.object({
    appium: z.string(),
    driver: z.string(),
    driverVersion: z.string(),
  }),
  hostImage: z.string().optional(),
});
export type DeviceProfile = z.infer<typeof DeviceProfile>;
