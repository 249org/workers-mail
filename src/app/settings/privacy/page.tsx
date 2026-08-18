import { PageHeader, SettingsBody } from "@/components/settings/page-header";
import { PrivacyForm } from "@/components/settings/privacy-form";
import { requireUser } from "@/lib/auth/server";

export default async function PrivacyPage() {
  await requireUser();

  return (
    <>
      <PageHeader title="Privacy">
        How mail is shown, whether people are added to the address book, and where this
        workspace keeps its data.
      </PageHeader>
      <SettingsBody flush>
        <PrivacyForm />
      </SettingsBody>
    </>
  );
}
