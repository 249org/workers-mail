import { describe, expect, it } from "vitest";
import {
  PRIVATE_ROBOTS,
  SITE_DESCRIPTION,
  SITE_TITLE,
  siteJsonLd,
  siteMetadata,
} from "@/lib/seo";

const ORIGIN = "https://mail.example.com";

describe("siteMetadata", () => {
  it("sets a title template and a SERP-length description", () => {
    const metadata = siteMetadata(ORIGIN);
    expect(metadata.title).toEqual({
      default: SITE_TITLE,
      template: "%s · Workers Mail",
    });
    expect(SITE_DESCRIPTION.length).toBeGreaterThanOrEqual(120);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
    expect(metadata.description).toBe(SITE_DESCRIPTION);
  });

  it("declares Open Graph, Twitter, canonical, and a large card image", () => {
    const metadata = siteMetadata(ORIGIN);
    expect(metadata.metadataBase?.toString()).toBe(`${ORIGIN}/`);
    expect(metadata.alternates?.canonical).toBe("/login");
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      siteName: "Workers Mail",
      url: `${ORIGIN}/login`,
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(metadata.openGraph?.images).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "/opengraph-image", width: 1200, height: 630 })]),
    );
    expect(metadata.manifest).toBe("/manifest.webmanifest");
  });
});

describe("siteJsonLd", () => {
  it("emits a graph with Organization, SoftwareApplication, WebSite, and WebPage", () => {
    const json = siteJsonLd(ORIGIN);
    const types = json["@graph"].flatMap((node) => {
      const value = node["@type"];
      return Array.isArray(value) ? value : [value];
    });
    expect(json["@context"]).toBe("https://schema.org");
    expect(types).toEqual(
      expect.arrayContaining(["Organization", "SoftwareApplication", "WebApplication", "WebSite", "WebPage"]),
    );
    const app = json["@graph"].find((node) => {
      const value = node["@type"];
      return Array.isArray(value) && value.includes("SoftwareApplication");
    });
    expect(app).toMatchObject({
      name: "Workers Mail",
      url: ORIGIN,
      applicationCategory: "BusinessApplication",
    });
    expect(JSON.stringify(json)).not.toContain("undefined");
  });
});

describe("PRIVATE_ROBOTS", () => {
  it("keeps mail and settings out of the index", () => {
    expect(PRIVATE_ROBOTS).toMatchObject({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    });
  });
});
