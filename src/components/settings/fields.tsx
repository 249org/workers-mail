import type { ReactNode } from "react";

export function PrefRow({
  title,
  hint,
  stack,
  children,
}: {
  title: string;
  hint: string;
  stack?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="settings-pref" data-stack={stack ? "" : undefined}>
      <div className="min-w-0">
        <h2 className="settings-pref-title">{title}</h2>
        <p className="settings-pref-hint">{hint}</p>
      </div>
      <div className="settings-pref-control">{children}</div>
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-[13px] text-[var(--danger)]">{children}</p>;
}
