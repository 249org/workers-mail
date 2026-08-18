import { headers } from "next/headers";
import type { Metadata } from "next";

export const SITE_NAME = "Workers Mail";
export const SITE_TAGLINE = "Your mail. Your Cloudflare account. Nobody else hosts it.";
export const SITE_TITLE = "Workers Mail — Mail on your Cloudflare account";
export const SITE_DESCRIPTION =
  "Self-hosted mail on Cloudflare Workers. Connect Gmail and Outlook over IMAP, or run native inboxes on your domain. Keyboard-first. You hold the keys.";
export const SITE_DESCRIPTION_LONG =
  "Keep Gmail. Keep Outlook. Keep the inbox you already have. Workers Mail is an IMAP client that runs on your Cloudflare account — plus native inboxes on domains you already operate.";
export const SITE_GITHUB = "https://github.com/249org/workers-mail";
export const SITE_LOCALE = "en_US";
export const OG_IMAGE_PATH = "/opengraph-image";
export const OG_IMAGE_ALT =
  "Workers Mail — self-hosted mail on Cloudflare, with IMAP for Gmail, Outlook, and any host that speaks the protocol.";

export const SITE_KEYWORDS = [
  "Workers Mail",
  "Cloudflare Workers email",
  "self-hosted mail",
  "IMAP client",
  "Gmail IMAP",
  "Outlook IMAP",
  "Cloudflare Email Routing",
  "keyboard-first mail",
  "self-hosted Gmail alternative",
];

export const PRIVATE_ROBOTS: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  noarchive: true,
  nosnippet: true,
  noimageindex: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
    noarchive: true,
    nosnippet: true,
  },
};

export const PUBLIC_ROBOTS: Metadata["robots"] = {
  index: true,
  follow: true,
  nocache: false,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
};

export async function appOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const hostHeader =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const host = hostHeader.split(",")[0]?.trim() || "localhost:3000";

  let protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (!protocol) {
    const visitor = requestHeaders.get("cf-visitor");
    if (visitor) {
      try {
        protocol = (JSON.parse(visitor) as { scheme?: string }).scheme;
      } catch {
        protocol = undefined;
      }
    }
  }
  if (!protocol) {
    protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  }

  return `${protocol}://${host}`;
}

export function siteMetadata(origin: string): Metadata {
  const ogImage = {
    url: OG_IMAGE_PATH,
    width: 1200,
    height: 630,
    alt: OG_IMAGE_ALT,
    type: "image/png",
  };

  return {
    metadataBase: new URL(origin),
    title: {
      default: SITE_TITLE,
      template: `%s · ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    authors: [{ name: SITE_NAME, url: SITE_GITHUB }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "productivity",
    keywords: SITE_KEYWORDS,
    referrer: "origin-when-cross-origin",
    robots: PUBLIC_ROBOTS,
    alternates: {
      canonical: "/login",
    },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
    },
    manifest: "/manifest.webmanifest",
    openGraph: {
      type: "website",
      locale: SITE_LOCALE,
      url: `${origin}/login`,
      siteName: SITE_NAME,
      title: SITE_TITLE,
      description: SITE_DESCRIPTION_LONG,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [ogImage],
    },
    appleWebApp: {
      capable: true,
      title: SITE_NAME,
      statusBarStyle: "default",
    },
    formatDetection: {
      telephone: false,
      address: false,
      email: false,
    },
    other: {
      "msapplication-TileColor": "#F9F9F8",
      "color-scheme": "light dark",
    },
  };
}

export function privateMetadata(title: string): Metadata {
  return {
    title,
    robots: PRIVATE_ROBOTS,
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      images: [],
    },
    twitter: {
      card: "summary",
      title: `${title} · ${SITE_NAME}`,
      images: [],
    },
  };
}

export type JsonLdGraph = {
  "@context": "https://schema.org";
  "@graph": Record<string, unknown>[];
};

export function siteJsonLd(origin: string): JsonLdGraph {
  const orgId = `${origin}/#organization`;
  const appId = `${origin}/#app`;
  const siteId = `${origin}/#website`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: SITE_NAME,
        url: origin,
        description: SITE_DESCRIPTION,
        sameAs: [SITE_GITHUB],
        logo: `${origin}/icon.svg`,
      },
      {
        "@type": ["SoftwareApplication", "WebApplication"],
        "@id": appId,
        name: SITE_NAME,
        url: origin,
        image: `${origin}${OG_IMAGE_PATH}`,
        screenshot: `${origin}${OG_IMAGE_PATH}`,
        description: SITE_DESCRIPTION_LONG,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "EmailClient",
        operatingSystem: "Web",
        browserRequirements: "Requires JavaScript. Requires HTML5.",
        featureList: [
          "IMAP client on Cloudflare Workers",
          "Connect Gmail and Google Workspace",
          "Connect Outlook, Hotmail, and Microsoft 365",
          "Native inboxes via Cloudflare Email Routing",
          "Keyboard-first mail workspace",
          "Credentials encrypted on your Cloudflare account",
        ],
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        author: { "@id": orgId },
        publisher: { "@id": orgId },
        downloadUrl: SITE_GITHUB,
        installUrl: origin,
        softwareHelp: {
          "@type": "CreativeWork",
          url: SITE_GITHUB,
        },
      },
      {
        "@type": "WebSite",
        "@id": siteId,
        name: SITE_NAME,
        url: origin,
        description: SITE_TAGLINE,
        inLanguage: "en",
        publisher: { "@id": orgId },
        about: { "@id": appId },
      },
      {
        "@type": "WebPage",
        "@id": `${origin}/login#webpage`,
        url: `${origin}/login`,
        name: SITE_TITLE,
        description: SITE_DESCRIPTION,
        isPartOf: { "@id": siteId },
        about: { "@id": appId },
        primaryImageOfPage: `${origin}${OG_IMAGE_PATH}`,
        inLanguage: "en",
      },
    ],
  };
}
