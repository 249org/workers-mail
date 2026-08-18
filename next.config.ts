import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["edgeport", "postal-mime"],
  images: { unoptimized: true },
};

void initOpenNextCloudflareForDev();

export default config;
