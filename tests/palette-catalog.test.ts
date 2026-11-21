import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "@/lib/appearance";
import { appearanceCommands, settingsCommands } from "@/lib/palette/catalog";
import { matchesCommand, type PaletteCommand } from "@/components/palette/command-palette";

describe("palette catalog", () => {
  it("exposes the mode toggle, system, every theme and both layouts", () => {
    const commands = appearanceCommands(DEFAULT_APPEARANCE, () => undefined);
    const ids = commands.map((command) => command.id);
    expect(ids).toContain("scheme-toggle");
    expect(ids).toContain("scheme-system");
    expect(ids).toContain("theme-github");
    expect(ids).toContain("theme-coolify");
    expect(ids).toContain("theme-paper");
    expect(ids).toContain("nav-floating");
    expect(ids).toContain("nav-default");
  });

  it("marks the active theme and layout", () => {
    const commands = appearanceCommands(
      { theme: { kind: "preset", id: "ember" }, mode: "system", nav: "default" },
      () => undefined,
    );
    expect(commands.find((command) => command.id === "theme-ember")?.suffix).toBe("On");
    expect(commands.find((command) => command.id === "nav-default")?.suffix).toBe("On");
    expect(commands.find((command) => command.id === "theme-nord")?.suffix).toBeUndefined();
    expect(commands.find((command) => command.id === "scheme-system")?.suffix).toBe("On");
  });

  it("flips the mode and keeps the theme", () => {
    // Dark Dracula toggles to light Dracula, not to some other theme's light version.
    let chosen: unknown = null;
    const fromDark = appearanceCommands(
      { theme: { kind: "preset", id: "dracula" }, mode: "dark", nav: "floating" },
      (next) => { chosen = next; },
    );
    expect(fromDark.find((command) => command.id === "scheme-toggle")?.label).toBe(
      "Switch to light mode",
    );
    fromDark.find((command) => command.id === "scheme-toggle")?.run();
    expect(chosen).toEqual({ theme: { kind: "preset", id: "dracula" }, mode: "light", nav: "floating" });

    const fromLight = appearanceCommands(
      { theme: { kind: "preset", id: "paper" }, mode: "light", nav: "floating" },
      (next) => { chosen = next; },
    );
    fromLight.find((command) => command.id === "scheme-toggle")?.run();
    expect(chosen).toMatchObject({ theme: { kind: "preset", id: "paper" }, mode: "dark" });
  });

  it("covers every settings page", () => {
    const hrefs: string[] = [];
    const commands = settingsCommands((href) => hrefs.push(href), () => undefined);
    expect(commands.some((command) => command.label === "Open appearance settings")).toBe(true);
    expect(commands.some((command) => command.label === "Open shortcut settings")).toBe(true);
    expect(commands.some((command) => command.label === "Show keyboard tour")).toBe(true);
    expect(commands.some((command) => command.label === "Add mailbox")).toBe(true);
    expect(commands.some((command) => command.label === "Open API keys")).toBe(true);
    expect(commands.some((command) => command.label === "Open privacy settings")).toBe(true);
    expect(commands.some((command) => command.label === "Open security settings")).toBe(true);
    expect(commands.some((command) => command.label === "Open signature settings")).toBe(true);
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
