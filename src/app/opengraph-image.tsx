import { ImageResponse } from "next/og";
import { OG_IMAGE_ALT, SITE_NAME, SITE_TAGLINE } from "@/lib/seo";

export const alt = OG_IMAGE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#F9F9F8",
        color: "#18181A",
        fontFamily: "ui-serif, Georgia, Times New Roman, serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          margin: 40,
          padding: "56px 64px",
          border: "1px solid #E4E4E1",
          background: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "#8046FD",
              color: "#FFFFFF",
              fontSize: 28,
              fontWeight: 600,
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
            }}
          >
            /
          </div>
          <div
            style={{
              display: "flex",
              marginLeft: 16,
              fontSize: 28,
              letterSpacing: "-0.04em",
            }}
          >
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              maxWidth: 900,
            }}
          >
            {SITE_TAGLINE}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 26,
              lineHeight: 1.4,
              color: "#6B6B70",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              maxWidth: 820,
            }}
          >
            IMAP on a Cloudflare Worker. Connect Gmail, Outlook, and any mailbox you already have —
            without handing it to another host.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 18,
            color: "#6B6B70",
          }}
        >
          <div style={{ display: "flex", color: "#C45C3E" }}>IMAP is the edge</div>
          <div style={{ display: "flex" }}>Runs on your Cloudflare account</div>
        </div>
      </div>
    </div>,
    { ...size },
  );
}
