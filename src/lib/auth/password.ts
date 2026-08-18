export const MIN_PASSWORD_LENGTH = 10;

export function passwordIssue(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "Use a password of at least 10 characters.";
  }
  return null;
}
