import { ObjectId } from "mongodb";
import { getDocumentsCollection } from "@/lib/mongo";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const collection = await getDocumentsCollection();
    const document = await collection.findOne({
      _id: new ObjectId(id),
    });

    if (!document) {
      return new Response("Not found", { status: 404 });
    }

    const rawFilename = document.title || document.originalName || "document";
    const safeFilename = rawFilename.replace(/[^\x20-\x7E]+/g, "_");
    const encodedFilename = encodeURIComponent(rawFilename);
    const fileBuffer = Buffer.isBuffer(document.file)
      ? document.file
      : Buffer.from(
          document.file?.buffer ??
            document.file?.value?.(true) ??
            document.file?.value?.() ??
            []
        );
    const fileLength = fileBuffer?.length || 0;

    if (!fileLength) {
      return new Response("File is empty.", { status: 404 });
    }

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": document.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
        "Content-Length": fileLength ? fileLength.toString() : "",
      },
    });
  } catch (error) {
    await logError("Failed to download document", error, {
      route: `/api/documents/${params?.id || "unknown"}`,
      method: request?.method,
      url: request?.url,
    });
    return new Response("Unable to download document.", { status: 500 });
  }
}
