export type ImageSize = { width: number; height: number };

/** Reads pixel dimensions from an image's header, which .docx needs up front. */
export function readImageSize(bytes: Uint8Array): ImageSize | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const startsWith = (...signature: number[]) => signature.every((b, i) => bytes[i] === b);

  try {
    if (startsWith(0x89, 0x50, 0x4e, 0x47)) {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (startsWith(0x47, 0x49, 0x46)) {
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }
    if (startsWith(0x42, 0x4d)) {
      return { width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) };
    }
    if (startsWith(0xff, 0xd8)) return readJpegSize(view);
  } catch {
    // A truncated file reads past the end; treat it the same as an unknown format.
  }
  return undefined;
}

function readJpegSize(view: DataView): ImageSize | undefined {
  let offset = 2;
  while (offset + 9 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return undefined;
    const marker = view.getUint8(offset + 1);
    // SOF0-SOF15 hold the dimensions, except DHT (C4), JPG (C8), and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return undefined;
}
