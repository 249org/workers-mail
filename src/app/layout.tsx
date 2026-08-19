import { cookies } from "next/headers";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import {
  APPEARANCE_BOOTSTRAP,
  APPEARANCE_COOKIE,
  parseAppearance,
} from "@/lib/appearance";
import { JsonLd } from "@/components/json-ld";
import { appOrigin, siteJsonLd, siteMetadata } from "@/lib/seo";
import { Providers } from "@/components/ui/providers";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
});

export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata(await appOrigin());
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F9F9F8" },
    { media: "(prefers-color-scheme: dark)", color: "#17171A" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const prefs = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);
  const origin = await appOrigin();

  return (
    <html
      lang="en"
      data-palette={prefs.palette}
      data-scheme={prefs.scheme}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP }} />
        <JsonLd data={siteJsonLd(origin)} />
      </head>
      <body className="font-sans antialiased touch-manipulation">
        {/*
          THESIS: Mail is a drawing — hairline regions vs pill controls — not a stack of floating cards.
          OWN-WORLD: Meridian. Warm off-white field #F9F9F8, cool slate-blue primary, terracotta highlight. Geist Sans 13px, Newsreader titles, Geist Mono eyebrows. Radius 4px on panels; rounded-full only on buttons.
          STORY: The operator reads and sends mail on their own Cloudflare account; chrome recedes into paper.
          FIRST VIEWPORT: Ruled header, three hairline panes, Compose as a pill. Login is a framed sheet on the field.
          FORM: Brief-pinned Meridian, Operate mode. Seed: operator-pinned.
          FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
        */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
