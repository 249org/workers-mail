"use client";

import { MailIcon, type IconName } from "./icons";

type Props = {
  icon: IconName;
  label: string;
  hint?: string;
  danger?: boolean;
  end?: boolean;
  start?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function ChromeButton({ icon, label, hint, danger, end, start, pressed, disabled, onClick }: Props) {
  const tip = hint ? `${label} (${hint})` : label;
  return (
    <button
      type="button"
      className={`tip btn btn-quiet btn-icon shrink-0 ${end ? "tip-end" : ""} ${start ? "tip-start" : ""}`}
      style={danger ? { color: "var(--danger)" } : undefined}
      data-tip={tip}
      aria-label={tip}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <MailIcon name={icon} filled={Boolean(pressed) && icon === "star"} />
    </button>
  );
}
