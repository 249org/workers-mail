import { cookies } from "next/headers";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  APPEARANCE_COOKIE,
  THEME_STYLE_ID,
  parseAppearance,
  schemeOf,
  themeCss,
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

export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata(await appOrigin());
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#010409" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);
  const origin = await appOrigin();

  return (
    <html
      lang="en"
      data-scheme={schemeOf(appearance)}
      data-nav={appearance.nav}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        {/* Rendered from the cookie, so the first paint is already in the chosen colours. */}
        <style id={THEME_STYLE_ID} dangerouslySetInnerHTML={{ __html: themeCss(appearance) }} />
        <JsonLd data={siteJsonLd(origin)} />
      </head>
      <body className="font-sans antialiased touch-manipulation">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
