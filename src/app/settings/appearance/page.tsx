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
        Every theme comes in light and dark. Pick one, set the mode, or mix your own.
      </PageHeader>
      <SettingsBody>
        <AppearanceForm />
      </SettingsBody>
    </>
  );
}
