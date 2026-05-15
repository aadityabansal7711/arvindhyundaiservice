import { NextRequest, NextResponse } from "next/server";

import supabaseAdmin from "@/lib/supabase-admin";
import { canAccessBranch, requireBodyshopAccess } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE_NAME = "bodyshop_jobs";
const HIDDEN_TABLE = "bodyshop_job_hidden";

type PhotoRow = {
  id?: string | null;
  ro_no?: string | null;
  branch_id?: string | null;
  photos?: unknown;
};

function errorPage(message: string, status = 404) {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Photo unavailable</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #f8fafc; color: #0f172a; }
    main { max-width: 420px; padding: 24px; text-align: center; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0; color: #475569; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>Photo unavailable</h1>
    <p>${escaped}</p>
  </main>
</body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

function cleanFilenamePart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "photo";
}

function detectImageContentType(bytes: Uint8Array, fallback?: string | null) {
  const lower = (fallback ?? "").split(";")[0].trim().toLowerCase();
  if (lower.startsWith("image/")) return lower;

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
  const ascii = new TextDecoder("ascii").decode(bytes.slice(0, 16));
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (ascii.includes("ftypheic")) return "image/heic";
  if (ascii.includes("ftypheif") || ascii.includes("ftypmif1")) return "image/heif";

  return "application/octet-stream";
}

function extensionForContentType(contentType: string) {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  return map[contentType] ?? "img";
}

function isAllowedStoredImageType(contentType: string) {
  return [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
  ].includes(contentType);
}

function imageResponse(bytes: Uint8Array, contentType: string, filenameBase: string) {
  const safeContentType = contentType.startsWith("image/")
    ? contentType
    : "application/octet-stream";
  const extension = extensionForContentType(safeContentType);
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": safeContentType,
      "Content-Disposition": `inline; filename="${filenameBase}.${extension}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseDataUrl(value: string) {
  const match = /^data:([^,]*?),([\s\S]*)$/.exec(value);
  if (!match) return null;

  const metadata = match[1] ?? "";
  const payload = match[2] ?? "";
  const parts = metadata.split(";").filter(Boolean);
  const declaredType = parts.find((part) => part.includes("/")) ?? "application/octet-stream";
  const isBase64 = parts.some((part) => part.toLowerCase() === "base64");

  try {
    const bytes = isBase64
      ? Uint8Array.from(Buffer.from(payload, "base64"))
      : new TextEncoder().encode(decodeURIComponent(payload));
    return {
      bytes,
      contentType: detectImageContentType(bytes, declaredType),
    };
  } catch {
    return null;
  }
}

async function loadPhotoRow(id: string) {
  const baseSelect = "id,ro_no,branch_id,photos";
  const byId = await supabaseAdmin
    .from(TABLE_NAME)
    .select(baseSelect)
    .eq("id", id)
    .maybeSingle();

  if (byId.error) throw new Error(byId.error.message);
  if (byId.data) return byId.data as PhotoRow;

  const byRo = await supabaseAdmin
    .from(TABLE_NAME)
    .select(baseSelect)
    .eq("ro_no", id)
    .maybeSingle();

  if (byRo.error) throw new Error(byRo.error.message);
  return (byRo.data as PhotoRow | null) ?? null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; index: string }> }
) {
  const auth = await requireBodyshopAccess();
  if (!auth.ok) return errorPage("Please sign in again before opening this photo.", 401);

  const { id, index } = await context.params;
  const photoIndex = Number(index);
  if (!Number.isInteger(photoIndex) || photoIndex < 0) {
    return errorPage("This photo link is invalid.", 400);
  }

  try {
    const hidden = await supabaseAdmin
      .from(HIDDEN_TABLE)
      .select("job_id")
      .eq("job_id", id)
      .maybeSingle();
    if (hidden?.data) return errorPage("This RO no longer exists.", 404);
  } catch {
    // Older installs may not have this table.
  }

  let row: PhotoRow | null;
  try {
    row = await loadPhotoRow(id);
  } catch (error) {
    return errorPage((error as Error).message || "Could not load this photo.", 500);
  }

  if (!row) return errorPage("This RO was not found.", 404);
  if (!(await canAccessBranch(auth.user, row.branch_id ?? null))) {
    return errorPage("This RO was not found.", 404);
  }

  const photos = Array.isArray(row.photos)
    ? row.photos.filter((photo): photo is string => typeof photo === "string" && photo.trim().length > 0)
    : [];
  const source = photos[photoIndex];
  if (!source) return errorPage("This photo is no longer available.", 404);

  const filenameBase = cleanFilenamePart(
    `ro-${String(row.ro_no ?? row.id ?? id)}-photo-${photoIndex + 1}`
  );

  if (source.startsWith("data:")) {
    const parsed = parseDataUrl(source);
    if (!parsed || parsed.bytes.length === 0) {
      return errorPage("The stored image data is invalid.", 415);
    }
    if (!isAllowedStoredImageType(parsed.contentType)) {
      return errorPage("This image type is not supported.", 415);
    }
    return imageResponse(parsed.bytes, parsed.contentType, filenameBase);
  }

  if (source.startsWith("blob:")) {
    return errorPage("This photo was saved as a temporary browser URL and cannot be reopened.", 410);
  }

  return errorPage("Remote photo URLs are not served by this app.", 415);
}
