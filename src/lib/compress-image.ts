const MAX_SIZE_BYTES = 100 * 1024; // 100KB
const MAX_FALLBACK_DATAURL_BYTES = 300 * 1024; // guardrail when canvas decode fails

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
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
  // heic2any is browser-only; dynamic import keeps server bundles clean.
  const mod = await import("heic2any");
  const heic2any = (mod as any).default ?? mod;
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
 * Compress an image file to at most 100KB. Uses canvas + JPEG quality.
 * Returns base64 data URL string (e.g. "data:image/jpeg;base64,...").
 */
export function compressImageToMax100KB(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const run = async () => {
            let input = file;
            if (isHeicLike(file)) {
                try {
                    input = await convertHeicToJpeg(file);
                } catch {
                    // Keep original file and try fallback below.
                    input = file;
                }
            }

            const img = new Image();
            const url = URL.createObjectURL(input);

            img.onload = () => {
                URL.revokeObjectURL(url);
                const maxDim = 1200;
                let w = img.width;
                let h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w >= h) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    } else {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                }

                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Canvas not supported"));
                    return;
                }
                ctx.drawImage(img, 0, 0, w, h);

                let quality = 0.92;
                const tryBlob = () => {
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) {
                                reject(new Error("Failed to compress image"));
                                return;
                            }
                            if (blob.size <= MAX_SIZE_BYTES || quality <= 0.1) {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result as string);
                                reader.onerror = () => reject(new Error("Failed to read blob"));
                                reader.readAsDataURL(blob);
                                return;
                            }
                            quality = Math.max(0.1, quality - 0.15);
                            tryBlob();
                        },
                        "image/jpeg",
                        quality
                    );
                };
                tryBlob();
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                // If browser can't decode the image, do NOT fall back to huge raw base64.
                // First, retry HEIC/HEIF conversion (some browsers fail decode but heic2any works).
                if (isHeicLike(file) && input === file) {
                    void convertHeicToJpeg(file)
                        .then((jpeg) => compressImageToMax100KB(jpeg))
                        .then(resolve)
                        .catch(() => {
                            reject(
                                new Error(
                                    "This HEIC image can't be processed on this device. Please try a JPG/PNG."
                                )
                            );
                        });
                    return;
                }

                // Otherwise only allow a tiny fallback to avoid DB/payload blowups.
                if (file.size > MAX_FALLBACK_DATAURL_BYTES) {
                    reject(
                        new Error(
                            `Image "${file.name}" is too large to upload. Please use a smaller JPG/PNG.`
                        )
                    );
                    return;
                }

                void fileToDataUrl(file).then(resolve).catch(reject);
            };
            img.src = url;
        };

        void run();
    });
}

/**
 * Compress multiple image files to at most 100KB each. Returns array of base64 data URLs.
 */
export async function compressImagesToMax100KB(files: File[]): Promise<string[]> {
    const results = await Promise.all(
        files.map((file) =>
            compressImageToMax100KB(file).catch((err) => {
                console.warn("Skip image:", file.name, err);
                return null;
            })
        )
    );
    return results.filter((r): r is string => r != null);
}
