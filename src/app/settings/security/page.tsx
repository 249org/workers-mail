import { PageHeader, SettingsBody } from "@/components/settings/page-header";
import { SecurityPanel } from "@/components/settings/security-panel";
import { requireUser } from "@/lib/auth/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  await requireUser();

  return (
    <>
      <PageHeader title="Security">
        Password, two-factor authentication, and the browsers signed in to this workspace.
      </PageHeader>
      <SettingsBody flush>
        <SecurityPanel />
      </SettingsBody>
    </>
  );
}
