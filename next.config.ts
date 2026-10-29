import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ] }, { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] }];
  },
  // Keep emulator browser tests separate from the regular development/build cache.
  distDir: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "demo-app-faltas" && process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" ? ".next-demo" : ".next",
};

export default nextConfig;
