import { requireUser } from "@/lib/auth/server";
import { AppToaster } from "@/components/ui/app-toaster";
import { privateMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = privateMetadata("Mail");

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="h-dvh bg-background">
      {children}
      <AppToaster />
    </div>
  );
}
