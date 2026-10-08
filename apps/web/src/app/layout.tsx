import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TapScout",
  description:
    "Autonomous mobile QA for Android and iOS: an NVIDIA Nemotron agent explores your app and reports evidence-backed, reproducible findings.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
