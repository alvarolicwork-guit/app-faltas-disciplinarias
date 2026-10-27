import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep emulator browser tests separate from the regular development/build cache.
  distDir: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "demo-app-faltas" && process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" ? ".next-demo" : ".next",
};

export default nextConfig;
