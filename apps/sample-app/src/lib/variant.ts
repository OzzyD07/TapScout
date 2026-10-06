/**
 * Build variant, inlined at bundle time from EXPO_PUBLIC_APP_VARIANT.
 * - seeded:       demo build with intentional defects (listed only in quality/ground-truth)
 * - fixed:        healthy control build
 * - changed_flow: same features with changed labels/order/layout, to test fresh exploration
 *
 * Nothing in the UI reveals the variant; the agent must not be able to read it.
 */
export type Variant = "seeded" | "fixed" | "changed_flow";

const raw = process.env.EXPO_PUBLIC_APP_VARIANT;

export const VARIANT: Variant = raw === "seeded" || raw === "changed_flow" ? raw : "fixed";
