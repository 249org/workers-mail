import { requireUser } from "@/lib/auth/server";
import { ApiKeyManager } from "@/components/settings/api-key-manager";
import { PageHeader } from "@/components/settings/page-header";

export default async function ApiKeysPage() {
  await requireUser();

  return (
    <div>
      <PageHeader title="API keys">
        Send a key as <code className="font-mono text-[12px]">Authorization: Bearer …</code> to use
        the mail API from scripts. Keys are shown once and stored only as a hash.
      </PageHeader>
      <ApiKeyManager />
    </div>
  );
}
