import { PageHeader, SettingsBody } from "@/components/settings/page-header";
import { ShortcutsForm } from "@/components/settings/shortcuts-form";
import { requireUser } from "@/lib/auth/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Shortcuts" };

export default async function ShortcutsPage() {
  await requireUser();

  return (
    <>
      <PageHeader title="Shortcuts">
        The same keys as <span className="kbd">?</span>. Reassign any of them; they save to this
        workspace.
      </PageHeader>
      <SettingsBody>
        <ShortcutsForm />
      </SettingsBody>
    </>
  );
}
