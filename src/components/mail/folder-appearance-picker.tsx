"use client";

import { MailIcon, type IconName } from "./icons";
import { useMailStore } from "@/lib/mail/view-store";
import {
  FOLDER_COLOR_LABELS,
  FOLDER_COLORS,
  FOLDER_ICONS,
  folderColorVar,
} from "@/lib/mail/folder-appearance";

type Props = {
  folderId: string;
  /** Shown as selected when nothing is picked, so the role default previews correctly. */
  fallbackIcon: IconName;
};

/**
 * Rendered inside the folder context menu. Icons and colours are separate axes, so a
 * folder can keep its role icon and take only a colour.
 *
 * State is read from the store rather than props: the menu builds its items once when
 * it opens, so captured props would leave the selection ring behind after a pick.
 */
export function FolderAppearancePicker({ folderId, fallbackIcon }: Props) {
  const folder = useMailStore((state) => state.folders.find((entry) => entry.id === folderId));
  const setFolderAppearance = useMailStore((state) => state.setFolderAppearance);

  const icon = folder?.icon ?? null;
  const color = folder?.color ?? null;
  const activeColor = color ?? "default";
  const onPick = (patch: { icon?: string | null; color?: string | null }) =>
    void setFolderAppearance(folderId, patch);

  return (
    <div>
      <p className="ctx-label">Colour</p>
      <div className="ctx-swatch-row">
        {FOLDER_COLORS.map((entry) => {
          const value = folderColorVar(entry);
          return (
            <button
              key={entry}
              type="button"
              className="ctx-swatch"
              aria-label={FOLDER_COLOR_LABELS[entry]}
              title={FOLDER_COLOR_LABELS[entry]}
              data-selected={activeColor === entry ? "true" : undefined}
              style={{
                background: value ?? "var(--muted-foreground)",
                // "Default" reads as an outline rather than a filled dot.
                opacity: entry === "default" ? 0.35 : 1,
              }}
              onClick={() => onPick({ color: entry === "default" ? null : entry })}
            />
          );
        })}
      </div>

      <p className="ctx-label">Icon</p>
      <div className="ctx-grid">
        {FOLDER_ICONS.map((entry) => (
          <button
            key={entry}
            type="button"
            className="ctx-tile"
            aria-label={entry}
            title={entry}
            data-selected={(icon ?? fallbackIcon) === entry ? "true" : undefined}
            style={{ color: folderColorVar(color) ?? undefined }}
            onClick={() => onPick({ icon: entry })}
          >
            <MailIcon name={entry} />
          </button>
        ))}
      </div>
    </div>
  );
}
