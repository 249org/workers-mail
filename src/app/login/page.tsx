import { redirect } from "next/navigation";
import { createDb } from "@/lib/db";
import { env } from "@/lib/env";
import { currentUser } from "@/lib/auth/server";
import { hasAnyUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await currentUser()) redirect("/mail");
  const setupNeeded = !(await hasAnyUser(createDb(env().DB)));

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Workers Mail</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {setupNeeded
              ? "Create the first account to finish setup."
              : "Sign in to your mail workspace."}
          </p>
        </div>
        <LoginForm setupNeeded={setupNeeded} />
      </div>
    </main>
  );
}
