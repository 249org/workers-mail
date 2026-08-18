const STORAGE_KEY = "workers-mail.mail-layout";

export type MailLayout = {
  sidebarCollapsed: boolean;
  listHidden: boolean;
};

export const DEFAULT_MAIL_LAYOUT: MailLayout = {
  sidebarCollapsed: false,
  listHidden: false,
};

export function readMailLayout(): MailLayout {
  if (typeof window === "undefined") return DEFAULT_MAIL_LAYOUT;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "") as Partial<MailLayout>;
    return {
      sidebarCollapsed: raw.sidebarCollapsed === true,
      listHidden: raw.listHidden === true,
    };
  } catch {
    return DEFAULT_MAIL_LAYOUT;
  }
}

export function writeMailLayout(layout: MailLayout): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}
