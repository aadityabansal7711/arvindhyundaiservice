const MAX_SIZE_BYTES = 100 * 1024; // 100KB

/**
 * Compress an image file to at most 100KB. Uses canvas + JPEG quality.
 * Returns base64 data URL string (e.g. "data:image/jpeg;base64,...").
 */
export function compressImageToMax100KB(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

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
            reject(new Error("Invalid image file"));
        };
        img.src = url;
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
