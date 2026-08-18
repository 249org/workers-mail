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
};

export function AppHeader({ email, name, mailboxes, context }: Props) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-8 py-3">
      <div className="flex items-center gap-3">
        <Link href="/mail" className="brand-home" aria-label="Workers Mail">
          <BrandLockup />
        </Link>
        {context === "settings" ? (
          <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Settings
          </span>
        ) : (
          mailboxes.length > 0 && (
            <span className="hidden font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase sm:inline">
              {mailboxes.length} mailbox{mailboxes.length === 1 ? "" : "es"}
            </span>
          )
        )}
      </div>
      <div className="flex items-center gap-2">
        {context === "settings" && (
          <Link href="/mail" className="btn btn-ghost">
            Back to mail
          </Link>
        )}
        <CommandCenter mailboxes={mailboxes} />
        <AccountMenu email={email} name={name} mailboxes={mailboxes} />
      </div>
    </header>
  );
}
