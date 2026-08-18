const DAY = 86_400;

export function formatMessageDate(seconds: number, now = Date.now() / 1000): string {
  const date = new Date(seconds * 1000);
  const age = now - seconds;

  if (age < DAY && date.getDate() === new Date(now * 1000).getDate()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (age < DAY * 300) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatFullDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelative(seconds: number | null): string {
  if (!seconds) return "never";
  const age = Math.max(0, Math.floor(Date.now() / 1000 - seconds));
  if (age < 60) return "just now";
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  if (age < DAY) return `${Math.floor(age / 3600)}h ago`;
  return `${Math.floor(age / DAY)}d ago`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function initialsOf(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}
