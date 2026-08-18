import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "@/lib/appearance";
import { appearanceCommands, settingsCommands } from "@/lib/palette/catalog";
import { matchesCommand, type PaletteCommand } from "@/components/palette/command-palette";

describe("palette catalog", () => {
  it("exposes light, dark, system, and every colour template", () => {
    const commands = appearanceCommands(DEFAULT_APPEARANCE, () => undefined);
    const ids = commands.map((command) => command.id);
    expect(ids).toContain("scheme-light");
    expect(ids).toContain("scheme-dark");
    expect(ids).toContain("scheme-system");
    expect(ids).toContain("palette-meridian");
    expect(ids).toContain("palette-dusk");
  });

  it("marks the active scheme and palette", () => {
    const commands = appearanceCommands(
      { palette: "ember", scheme: "dark" },
      () => undefined,
    );
    expect(commands.find((command) => command.id === "scheme-dark")?.suffix).toBe("On");
    expect(commands.find((command) => command.id === "palette-ember")?.suffix).toBe("On");
    expect(commands.find((command) => command.id === "scheme-light")?.suffix).toBeUndefined();
  });

  it("covers every settings page", () => {
    const hrefs: string[] = [];
    const commands = settingsCommands((href) => hrefs.push(href), () => undefined);
    expect(commands.some((command) => command.label === "Open appearance settings")).toBe(true);
    expect(commands.some((command) => command.label === "Open shortcut settings")).toBe(true);
    expect(commands.some((command) => command.label === "Show keyboard tour")).toBe(true);
    expect(commands.some((command) => command.label === "Add mailbox")).toBe(true);
    expect(commands.some((command) => command.label === "Open API keys")).toBe(true);
    commands.find((command) => command.id === "settings-/settings/domains")?.run();
    expect(hrefs).toContain("/settings/domains");
  });
});

describe("matchesCommand", () => {
  const command: PaletteCommand = {
    id: "scheme-dark",
    label: "Use dark mode",
    group: "Appearance",
    keywords: ["theme", "night"],
    run: () => undefined,
  };

  it("matches label, group, and keywords", () => {
    expect(matchesCommand(command, "dark")).toBe(true);
    expect(matchesCommand(command, "night")).toBe(true);
    expect(matchesCommand(command, "Appearance")).toBe(true);
    expect(matchesCommand(command, "inbox")).toBe(false);
  });
});
