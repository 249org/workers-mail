import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await appOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/icon.svg", "/apple-icon.svg", "/opengraph-image", "/manifest.webmanifest"],
        disallow: ["/mail", "/settings", "/api/", "/login/reset"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
