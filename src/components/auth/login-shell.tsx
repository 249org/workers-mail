import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/wordmark";

/** Sign-in, reset and first run: one card on the dotted canvas, in the chosen theme. */
export function LoginShell({
  heading,
  lede,
  children,
}: {
  heading: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-canvas">
      <header className="auth-top">
        <span className="auth-mark" aria-hidden>
          <BrandMark className="size-4" />
        </span>
        Workers Mail
      </header>
      <main id="main" className="auth-main">
        <div className="auth-card">
          <header className="auth-card-head">
            <h1 className="auth-card-title">{heading}</h1>
            {lede ? <p className="auth-card-lede">{lede}</p> : null}
          </header>
          {children}
        </div>
      </main>
      <footer className="auth-foot">A private mailbox, on a server you run.</footer>
    </div>
  );
}
