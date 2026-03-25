// Next.js route handlers can reject large JSON bodies; base64 expands size ~33%.
// To make uploads deterministic, keep the final base64 data URL length very small.
// 60KB cap is intentionally conservative so the JSON request body stays under limits.
const MAX_SIZE_BYTES = 30 * 1024; // (not strictly required anymore, but kept for guardrails)
const MAX_FALLBACK_DATAURL_BYTES = 70 * 1024; // raw bytes (fallback only when encoding fails)
const MAX_DATAURL_LENGTH = 60 * 1024; // final data URL string length cap (deterministic)
/** Raw HEIC fallback only when conversion fails. */
const MAX_HEIC_RAW_FALLBACK_BYTES = 800 * 1024;
const COMPRESS_TIMEOUT_MS = 20000;
const HEIC_COMPRESS_TIMEOUT_MS = 30000;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        const dataUrl = reader.result;
        // Enforce the same deterministic limit for ALL fallback paths.
        // Some fallbacks skip canvas/JPEG quality loops and can otherwise exceed
        // JSON request body limits on the server.
        if (dataUrl.length > MAX_DATAURL_LENGTH) {
          reject(
            new Error(
              `Image "${file.name}" is too large to upload. Please use a smaller JPG/PNG.`
            )
          );
          return;
        }
        resolve(dataUrl);
      } else {
        reject(new Error("Failed to read file as data URL"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function isHeicLike(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  const n = (file.name || "").toLowerCase();
  return (
    t === "image/heic" ||
    t === "image/heif" ||
    n.endsWith(".heic") ||
    n.endsWith(".heif")
  );
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const mod = (await import("heic2any")) as {
    default?: (opts: { blob: Blob; toType: string; quality: number }) => Promise<Blob | Blob[]>;
  };
  const heic2any = mod.default ?? (mod as unknown as (opts: { blob: Blob; toType: string; quality: number }) => Promise<Blob | Blob[]>);
  const converted = (await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  })) as Blob | Blob[];
  const outBlob = Array.isArray(converted) ? converted[0] : converted;
  if (!outBlob) {
    throw new Error("Failed to convert HEIC image");
  }

  const jpgName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([outBlob], jpgName, { type: "image/jpeg" });
}

/**
 * Resize + JPEG encode to keep payload small enough for uploads.
 * Uses a dataURL fallback if JPEG toBlob returns null (known Chromium quirk).
 * Falls back to fileToDataUrl if canvas fails entirely (e.g., hardware acceleration disabled).
 */
function compressRasterWithCanvas(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    let settled = false;

    // Safety net: if the Image never fires onload/onerror (can happen when the
    // underlying File blob has been released by the browser), reject instead of
    // hanging the caller forever.
    const imgTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      reject(
        new Error(
          `Image "${file.name}" could not be loaded for compression. Please re-select the photo and try again.`
        )
      );
    }, 15_000);

    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(imgTimer);
      URL.revokeObjectURL(url);
      // Reduce dimensions to make encoding consistently small across browsers.
      const maxDim = 900;
      let w = img.width || 1;
      let h = img.height || 1;
      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      let canvas: HTMLCanvasElement | null = null;
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        ctx = canvas.getContext("2d");
      } catch {
        // Canvas creation failed – fall through to fileToDataUrl
      }

      if (!canvas || !ctx) {
        // Canvas not supported on this device; fall back to raw data URL.
        if (file.size > MAX_FALLBACK_DATAURL_BYTES) {
          reject(
            new Error(
              `Image "${file.name}" is too large (canvas unavailable). Please use a photo under 100KB.`
            )
          );
          return;
        }
        void fileToDataUrl(file).then(resolve).catch(reject);
        return;
      }

      try {
        ctx.drawImage(img, 0, 0, w, h);
      } catch {
        // drawImage can fail for certain image types in some browsers.
        if (file.size > MAX_FALLBACK_DATAURL_BYTES) {
          reject(
            new Error(
              `Image "${file.name}" could not be processed. Please use a JPG/PNG under 100KB.`
            )
          );
          return;
        }
        void fileToDataUrl(file).then(resolve).catch(reject);
        return;
      }

      // Deterministic encoding path: only use toDataURL, and keep lowering quality
      // until we fit the base64 length ceiling.
      let q = 0.85;
      for (let attempt = 0; attempt < 14; attempt += 1) {
        try {
          const dataUrl = canvas!.toDataURL("image/jpeg", q);
          if (dataUrl.length <= MAX_DATAURL_LENGTH) {
            resolve(dataUrl);
            return;
          }
        } catch {
          // ignore and lower quality
        }
        q = Math.max(0.05, q - 0.08);
      }

      // Last resort: raw data URL only if the original file is already small-ish.
      if (file.size <= MAX_FALLBACK_DATAURL_BYTES) {
        void fileToDataUrl(file).then(resolve).catch(reject);
        return;
      }

      reject(
        new Error(
          `Image "${file.name}" is too large to upload. Please use a smaller JPG/PNG.`
        )
      );
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(imgTimer);
      URL.revokeObjectURL(url);
      // Browser couldn't decode the image – fall back to raw data URL for smaller files.
      if (file.size > MAX_FALLBACK_DATAURL_BYTES) {
        reject(
          new Error(
            `Image "${file.name}" could not be decoded. Please use a JPG/PNG under 100KB.`
          )
        );
        return;
      }
      void fileToDataUrl(file).then(resolve).catch(reject);
    };
    img.src = url;
  });
}

/**
 * Compress an image file to at most 100KB. Uses HEIC→JPEG conversion when needed, then canvas + JPEG quality.
 * Returns base64 data URL string (e.g. "data:image/jpeg;base64,...").
 */
export async function compressImageToMax100KB(file: File): Promise<string> {
  let workFile = file;

  if (isHeicLike(file)) {
    try {
      workFile = await convertHeicToJpeg(file);
    } catch {
      if (file.size > MAX_HEIC_RAW_FALLBACK_BYTES) {
        throw new Error(
          `HEIC image "${file.name}" could not be converted. Try a smaller photo or export as JPG from your phone.`
        );
      }
      return fileToDataUrl(file);
    }
  }

  return compressRasterWithCanvas(workFile);
}

/**
 * Compress multiple image files to at most 100KB each. Returns array of base64 data URLs.
 * Processes sequentially to avoid memory spikes on mobile.
 */
export async function compressImagesToMax100KB(files: File[]): Promise<string[]> {
  const results: string[] = [];

  for (const file of files) {
    const timeoutMs = isHeicLike(file) ? HEIC_COMPRESS_TIMEOUT_MS : COMPRESS_TIMEOUT_MS;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Image "${file.name}" took too long to process. Please try a smaller file.`)),
        timeoutMs
      )
    );

    // Race compression against the timeout. On failure fall back to raw data URL for reasonably
    // sized files, so a single bad image doesn't block the whole upload.
    let result: string;
    try {
      result = await Promise.race([compressImageToMax100KB(file), timeout]);
    } catch (compressErr) {
      // Compression failed or timed out. Try raw data URL if the file is small enough.
      if (file.size > MAX_FALLBACK_DATAURL_BYTES) {
        throw compressErr instanceof Error
          ? compressErr
          : new Error(`Image "${file.name}" could not be processed. Please use a JPG/PNG under 100KB.`);
      }
      try {
        result = await fileToDataUrl(file);
      } catch {
        throw new Error(`Image "${file.name}" could not be read. Please try a different photo.`);
      }
    }

    results.push(result);
  }

  return results;
}
