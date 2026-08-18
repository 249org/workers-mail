import { redirect } from "next/navigation";
import { createDb } from "@/lib/db";
import { env } from "@/lib/env";
import { currentUser } from "@/lib/auth/server";
import { hasAnyUser } from "@/lib/auth/session";
import { SITE_TITLE } from "@/lib/seo";
import { AuthScreen } from "./auth-screen";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  alternates: { canonical: "/login" },
  openGraph: { url: "/login" },
};

export default async function LoginPage() {
  if (await currentUser()) redirect("/mail");

  const setupNeeded = !(await hasAnyUser(createDb(env().DB)));
  const encryptionReady = Boolean(env().MAIL_ENCRYPTION_KEY);

  return <AuthScreen setupNeeded={setupNeeded} encryptionReady={encryptionReady} />;
}
