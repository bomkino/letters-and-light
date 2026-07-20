/** Local image intake: file/drop/paste decode with sniffed formats, EXIF
 *  orientation, byte + working-pixel hashing, bounded working resolution.
 *  No object URLs, no network, no persistence of image bytes. */

export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_DECODED_PIXELS = 40_000_000;
export const WORKING_MAX_DIMENSION = 1024;

export type SniffedFormat = "jpeg" | "png" | "webp";

export class ImageIntakeError extends Error {
  constructor(
    readonly code: "unsupported" | "too_large" | "too_many_pixels" | "decode_failed",
    message: string,
  ) {
    super(message);
    this.name = "ImageIntakeError";
  }
}

export const sniffFormat = (bytes: Uint8Array): SniffedFormat | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "webp";
  }
  return null;
};

const sha256Hex = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export type DecodedSource = {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  format: SniffedFormat;
  sourceFileHash: string;
  bytes: Uint8Array;
};

/** Decode a local file/blob into an oriented bitmap. EXIF orientation is
 *  applied by the platform via imageOrientation: "from-image". */
export const decodeImageFile = async (file: Blob): Promise<DecodedSource> => {
  if (file.size > MAX_FILE_BYTES) {
    throw new ImageIntakeError("too_large", `This file is ${(file.size / (1024 * 1024)).toFixed(0)} MB. The limit is 32 MB — export a smaller copy and try again.`);
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const format = sniffFormat(bytes);
  if (!format) {
    throw new ImageIntakeError("unsupported", "This file is not a JPEG, PNG, or WebP we can open locally. Try one of those three.");
  }
  const sourceFileHash = await sha256Hex(buffer);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image", premultiplyAlpha: "premultiply" });
  } catch {
    throw new ImageIntakeError("decode_failed", "The file named a format we know, but the image itself would not decode.");
  }
  if (bitmap.width * bitmap.height > MAX_DECODED_PIXELS) {
    bitmap.close();
    throw new ImageIntakeError(
      "too_many_pixels",
      `At ${bitmap.width} × ${bitmap.height} this image is heavier than our 40 megapixel working limit. Scale it down and bring it back.`,
    );
  }
  return { bitmap, width: bitmap.width, height: bitmap.height, format, sourceFileHash, bytes };
};

export type WorkingImage = {
  width: number;
  height: number;
  /** Normalized RGBA8 working pixels. Core begins exactly here. */
  rgba: ArrayBuffer;
  hasAlpha: boolean;
};

/** Normalize to a bounded working resolution. The displayed canvas, the crop
 *  UI, the hash, and the engine all see these same pixels. */
export const normalizeWorkingPixels = (bitmap: ImageBitmap): WorkingImage => {
  const scale = Math.min(1, WORKING_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new ImageIntakeError("decode_failed", "This browser could not prepare a working canvas.");
  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  let hasAlpha = false;
  const data = imageData.data;
  const stride = Math.max(4, Math.floor(data.length / 4 / 512) * 4);
  for (let index = 3; index < data.length; index += stride) {
    if ((data[index] ?? 255) < 250) {
      hasAlpha = true;
      break;
    }
  }
  return { width, height, rgba: data.buffer.slice(0) as ArrayBuffer, hasAlpha };
};

/** Release every resource tied to a decoded source. */
export const releaseSource = (source: DecodedSource | null): void => {
  source?.bitmap.close();
};
