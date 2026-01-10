import { NextResponse } from "next/server";
import { getDocumentsCollection } from "@/lib/mongo";
import { logError } from "@/lib/logger";
import { getToken } from "next-auth/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const collection = await getDocumentsCollection();
    const documents = await collection
      .find({}, { projection: { file: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    const sanitized = documents.map((doc) => ({
      ...doc,
      _id: doc._id.toString(),
    }));

    return NextResponse.json({ documents: sanitized });
  } catch (error) {
    await logError("Failed to list documents", error, {
      route: "/api/documents",
      method: "GET",
    });
    return NextResponse.json(
      { error: "Unable to load documents." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const title = formData.get("title");

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        { error: "Please attach a file to upload." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const payload = {
      title: typeof title === "string" && title.trim() ? title.trim() : file.name,
      originalName: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size || buffer.length,
      uploadedBy: token.sub,
      uploadedByEmail: token.email,
      createdAt: new Date(),
      file: buffer,
    };

    const collection = await getDocumentsCollection();
    const result = await collection.insertOne(payload);

    return NextResponse.json({
      document: { _id: result.insertedId, ...payload, file: undefined },
    });
  } catch (error) {
    await logError("Failed to upload document", error, {
      route: "/api/documents",
      method: request?.method,
      url: request?.url,
    });
    return NextResponse.json(
      { error: "Unable to upload document." },
      { status: 500 }
    );
  }
}
