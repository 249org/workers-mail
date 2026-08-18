"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PRIVACY, type PrivacyPrefs } from "@/lib/privacy";
import { usePrivacyStore } from "@/lib/privacy-store";
import { PrefRow } from "./fields";

export function PrivacyForm() {
  const prefs = usePrivacyStore((state) => state.prefs);
  const setPrefs = usePrivacyStore((state) => state.setPrefs);
  const hydrate = usePrivacyStore((state) => state.hydrate);
  const [local, setLocal] = useState<PrivacyPrefs>(DEFAULT_PRIVACY);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    setLocal(prefs);
  }, [prefs]);

  function update(patch: Partial<PrivacyPrefs>) {
    const next = { ...local, ...patch };
    setLocal(next);
    setPrefs(next);
  }

  return (
    <div>
      <PrefRow
        title="Remote images"
        hint="Images hosted outside this message can tell the sender you opened it. Blocked images stay as placeholders until you allow them on that letter."
      >
        <div className="scheme-toggle" role="radiogroup" aria-label="Remote images">
          <Toggle
            active={local.remoteImages === "ask"}
            onClick={() => update({ remoteImages: "ask" })}
          >
            Ask each time
          </Toggle>
          <Toggle
            active={local.remoteImages === "allow"}
            onClick={() => update({ remoteImages: "allow" })}
          >
            Load automatically
          </Toggle>
        </div>
      </PrefRow>

      <PrefRow
        title="Collect contacts"
        hint="People on mail you send and receive are added to the address book. Turning this off leaves existing contacts in place."
      >
        <div className="scheme-toggle" role="radiogroup" aria-label="Collect contacts">
          <Toggle active={local.collectContacts} onClick={() => update({ collectContacts: true })}>
            On
          </Toggle>
          <Toggle
            active={!local.collectContacts}
            onClick={() => update({ collectContacts: false })}
          >
            Off
          </Toggle>
        </div>
      </PrefRow>

      <PrefRow
        title="Where mail lives"
        hint="Messages, attachments, and credentials stay on this Cloudflare account. Sessions are stored as hashes. Authenticator secrets are encrypted with MAIL_ENCRYPTION_KEY."
      >
        <p className="text-[13px] text-muted-foreground">This deployment. No third-party host.</p>
      </PrefRow>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className="scheme-toggle-btn"
      data-active={active ? "true" : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
