import { requireUser } from "@/lib/auth/server";
import { ApiKeyManager } from "@/components/settings/api-key-manager";

export default async function ApiKeysPage() {
  await requireUser();

  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight">API keys</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Send a key as <code className="font-mono text-xs">Authorization: Bearer …</code> to use
        the mail API from scripts. Keys are shown once and stored only as a hash.
      </p>
      <ApiKeyManager />
    </div>
  );
}
