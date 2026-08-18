import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/wordmark";

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
    <main className="login-split">
      <aside className="login-brand">
        <div className="login-brand-top">
          <BrandLockup />
        </div>
        <div className="login-brand-copy">
          <h1 className="login-brand-title">Your mail. Your Cloudflare account.</h1>
          <p className="login-brand-lede">
            A keyboard-first mailbox on this Worker. Native inboxes on your domain, IMAP for
            everything else. Nobody else hosts it.
          </p>
        </div>
        <div className="login-scene" aria-hidden>
          <div className="login-scene-rail">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="login-scene-list">
            <span data-on="" />
            <span />
            <span />
            <span />
          </div>
          <div className="login-scene-read">
            <span className="login-scene-subject" />
            <span />
            <span />
            <span />
          </div>
        </div>
        <p className="login-brand-keys">
          <span className="kbd">J</span>
          <span className="kbd">K</span>
          <span className="kbd">E</span>
          <span className="kbd">⌘K</span>
        </p>
      </aside>

      <section className="login-pane">
        <div className="login-pane-inner">
          <header className="login-pane-head">
            <h2 className="login-pane-title">{heading}</h2>
            {lede ? <p className="login-pane-lede">{lede}</p> : null}
          </header>
          {children}
        </div>
      </section>
    </main>
  );
}
