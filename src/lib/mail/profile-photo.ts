import { escapeHtml } from "./sanitize";

export const PROFILE_PHOTO_CID = "profile-photo@workers-mail";
export const AVATAR_MAX_BYTES = 1024 * 1024;

export function avatarObjectKey(userId: string): string {
  return `avatars/${userId}`;
}

export function avatarSrc(updatedAt: number | null | undefined): string | null {
  if (!updatedAt) return null;
  return `/api/account/avatar?v=${updatedAt}`;
}

export function addressAvatarSrc(address: string): string {
  return `/api/avatars?address=${encodeURIComponent(address.toLowerCase())}`;
}

export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Puts the sender's photo at the top of the HTML part so other clients can show it. */
export function wrapOutboundHtml(
  html: string,
  from: { name?: string | null; address: string },
  cid: string = PROFILE_PHOTO_CID,
): string {
  if (html.includes(`cid:${cid}`)) return html;
  const name = escapeHtml(from.name?.trim() || from.address);
  const address = escapeHtml(from.address);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 1.25rem;border-collapse:collapse;">
<tr>
<td style="vertical-align:top;padding-right:12px;">
<img src="cid:${cid}" width="40" height="40" alt="" style="border-radius:4px;display:block;border:0;" />
</td>
<td style="vertical-align:middle;font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181a;">
<div style="font-weight:600;">${name}</div>
<div style="color:#6b6b70;">${address}</div>
</td>
</tr>
</table>
${html}`;
}
