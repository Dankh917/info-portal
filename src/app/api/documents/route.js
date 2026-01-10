import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { clientPromise, getDocumentsCollection } from "@/lib/mongo";
import { logError } from "@/lib/logger";
import { getToken } from "next-auth/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dbName = process.env.MONGODB_DB || "info-portal";

const deriveUsername = (value) =>
  (value || "")
    .toString()
    .trim()
    .replace(/@.+$/, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 50) || "user";

const toObjectId = (value) => {
  try {
    return new ObjectId(value);
  } catch (error) {
    return null;
  }
};

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

    const uploaderIds = documents
      .map((doc) => toObjectId(doc.uploadedBy))
      .filter(Boolean);

    let uploaderMap = new Map();
    if (uploaderIds.length) {
      const client = await clientPromise;
      const usersCollection = client.db(dbName).collection("users");
      const uploaderRecords = await usersCollection
        .find({ _id: { $in: uploaderIds } })
        .project({ username: 1, normalizedUsername: 1, name: 1, email: 1 })
        .toArray();

      uploaderMap = new Map(
        uploaderRecords.map((u) => [
          u._id.toString(),
          {
            username:
              u.username ||
              u.normalizedUsername ||
              deriveUsername(u.name || u.email || u._id.toString()),
            name: u.name || u.email || "",
          },
        ]),
      );
    }

    const sanitized = documents.map((doc) => {
      const uploader = uploaderMap.get(doc.uploadedBy?.toString?.() || "");
      const username =
        doc.uploadedByUsername ||
        uploader?.username ||
        deriveUsername(doc.uploadedByEmail || doc.uploadedBy || "");

      return {
        ...doc,
        _id: doc._id.toString(),
        uploadedByUsername: username,
        uploadedByName: uploader?.name || username || doc.uploadedByEmail || "-",
      };
    });

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
      uploadedByUsername: token.username || deriveUsername(token.email || token.name || token.sub),
      createdAt: new Date(),
      file: buffer,
    };

    const collection = await getDocumentsCollection();
    const result = await collection.insertOne(payload);

    return NextResponse.json({
      document: {
        _id: result.insertedId.toString(),
        ...payload,
        file: undefined,
      },
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
