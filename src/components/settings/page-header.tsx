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
    <header className="ruled-band relative mb-6">
      <div className="relative flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {children ? (
            <div className="mt-2 text-[13px] text-muted-foreground">{children}</div>
          ) : null}
        </div>
        {action}
      </div>
    </header>
  );
}
