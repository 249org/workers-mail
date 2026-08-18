import type { ReactNode } from "react";

export function PageHeader({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="settings-spread-head">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {children ? (
            <div className="mt-1.5 max-w-2xl text-[13px] text-muted-foreground">{children}</div>
          ) : null}
        </div>
        {action}
      </div>
    </header>
  );
}

export function SettingsBody({
  children,
  flush,
}: {
  children: ReactNode;
  flush?: boolean;
}) {
  return <div className={flush ? "settings-spread-body" : "settings-spread-body settings-prose"}>{children}</div>;
}
