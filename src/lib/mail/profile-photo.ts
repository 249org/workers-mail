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

