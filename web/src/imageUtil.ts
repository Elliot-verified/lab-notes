// Read a File and return a downscaled JPEG data URI capped to maxDim px on
// the longest edge. Keeps things small enough for the JSON-blob storage we
// use for note blocks.
export async function fileToDataUri(
  file: File,
  maxDim = 1280,
  quality = 0.85
): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  // JPEG keeps file size predictable; transparency lost is fine for lab photos.
  return canvas.toDataURL("image/jpeg", quality);
}
