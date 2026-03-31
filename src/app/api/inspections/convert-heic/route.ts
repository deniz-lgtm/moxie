import { NextResponse } from "next/server";
import sharp from "sharp";

/**
 * POST /api/inspections/convert-heic
 *
 * Converts HEIC/HEIF images to JPEG using sharp (libvips).
 * Accepts multipart FormData with a "file" field.
 * Returns the converted JPEG blob.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Read file into buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Convert to JPEG using sharp (supports HEIC via libvips)
    const jpegBuffer = await sharp(buffer)
      .resize(1920, undefined, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    return new NextResponse(new Uint8Array(jpegBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpegBuffer.length),
      },
    });
  } catch (error: any) {
    console.error("[convert-heic] Error:", error.message);
    return NextResponse.json(
      { error: "Failed to convert image. Format may not be supported." },
      { status: 500 },
    );
  }
}
