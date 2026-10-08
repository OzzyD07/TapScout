import type { NextConfig } from "next";

// Local scripts load the monorepo root .env through dotenv-cli; Vercel injects its own environment.

const nextConfig: NextConfig = {
  // Cache Components stays off: almost every page is per-user and live (docs/05 F1 note).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
