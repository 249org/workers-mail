export const TUTORIAL_STORAGE_KEY = "workers-mail.tutorial";

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_STORAGE_KEY) === "seen";
  } catch {
    return true;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "seen");
  } catch {
    // Private mode — skip persistence; the tour still closes.
  }
}
