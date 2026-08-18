import { PageHeader, SettingsBody } from "@/components/settings/page-header";
import { AppearanceForm } from "@/components/settings/appearance-form";
import { requireUser } from "@/lib/auth/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Appearance" };

export default async function AppearancePage() {
  await requireUser();

  return (
    <>
      <PageHeader title="Appearance">
        Pick a colour template and whether the workspace follows the OS, or stays light or dark.
      </PageHeader>
      <SettingsBody>
        <AppearanceForm />
      </SettingsBody>
    </>
  );
}
