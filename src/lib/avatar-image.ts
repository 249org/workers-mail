const SIZE = 256;
const QUALITY = 0.88;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/** Cover-crops to a 256px JPEG so the Worker never has to resize. */
export async function prepareAvatarFile(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a JPEG, PNG, or WebP photo.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Keep the photo under 8 MB.");
  }

  const bitmap = await loadBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the photo.");

  const scale = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (SIZE - width) / 2, (SIZE - height) / 2, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", QUALITY);
  });
  if (!blob) throw new Error("The photo could not be encoded.");
  return blob;
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error("That file is not a readable photo.");
  }
}
