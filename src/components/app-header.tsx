import Link from "next/link";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { BrandLockup } from "./brand/wordmark";
import { AccountMenu } from "./account-menu";
import { CommandCenter } from "./palette/command-center";

type Props = {
  email: string;
  name: string | null;
  mailboxes: PublicMailbox[];
  context: "mail" | "settings";
  avatarUpdatedAt?: number | null;
};

export function AppHeader({ email, name, mailboxes, context, avatarUpdatedAt }: Props) {
  return (
    <header className="app-chrome flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:gap-4 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/mail" className="brand-home" aria-label="Workers Mail">
          <BrandLockup />
        </Link>
        {context === "settings" ? (
          <span className="text-[13px] text-muted-foreground">Settings</span>
        ) : (
          mailboxes.length > 0 && (
            <span className="hidden text-[13px] text-muted-foreground sm:inline">
              {mailboxes.length} mailbox{mailboxes.length === 1 ? "" : "es"}
            </span>
          )
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {context === "mail" && (
          <Link href="/settings/mailboxes/new" className="btn btn-ghost max-md:hidden">
            Add mailbox
          </Link>
        )}
        {context === "settings" && (
          <Link href="/mail" className="btn btn-ghost">
            Back to mail
          </Link>
        )}
        <CommandCenter mailboxes={mailboxes} />
        <AccountMenu
          email={email}
          name={name}
          mailboxes={mailboxes}
          avatarUpdatedAt={avatarUpdatedAt}
        />
      </div>
    </header>
  );
}
