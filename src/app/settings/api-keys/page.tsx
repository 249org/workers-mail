import { requireUser } from "@/lib/auth/server";
import { ApiKeyManager } from "@/components/settings/api-key-manager";
import { PageHeader, SettingsBody } from "@/components/settings/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  await requireUser();

  return (
    <>
      <PageHeader title="API keys">
        Send a key as <code className="font-mono text-[13px]">Authorization: Bearer …</code> to use
        the mail API from scripts. Keys are shown once and stored only as a hash.
      </PageHeader>
      <SettingsBody flush>
        <ApiKeyManager />
      </SettingsBody>
    </>
  );
}
