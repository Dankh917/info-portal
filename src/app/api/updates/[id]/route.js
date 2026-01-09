import { NextResponse } from "next/server";
import { getUpdatesCollection } from "@/lib/mongo";
import { getToken } from "next-auth/jwt";
import { ObjectId } from "mongodb";
import { logError } from "@/lib/logger";

export async function PATCH(request, { params }) {
  let token;
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid update ID." }, { status: 400 });
    }

    const collection = await getUpdatesCollection();
    const existingUpdate = await collection.findOne({ _id: new ObjectId(id) });

    if (!existingUpdate) {
      return NextResponse.json({ error: "Update not found." }, { status: 404 });
    }

    // Check if user is author or admin
    const isAdmin = token.role === "admin";
    const isAuthor = existingUpdate.authorId === token.sub;

    if (!isAdmin && !isAuthor) {
      return NextResponse.json(
        { error: "You can only edit your own updates." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const title = body?.title?.trim();
    const message = body?.message?.trim();

    if (!title || !message) {
      return NextResponse.json(
        { error: "Title and message are required." },
        { status: 400 }
      );
    }

    const updateDoc = {
      title,
      message,
      updatedAt: new Date(),
    };

    await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logError("Failed to update update", error, {
      route: "/api/updates/[id]",
      method: "PATCH",
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to update right now." },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  let token;
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid update ID." }, { status: 400 });
    }

    const collection = await getUpdatesCollection();
    const existingUpdate = await collection.findOne({ _id: new ObjectId(id) });

    if (!existingUpdate) {
      return NextResponse.json({ error: "Update not found." }, { status: 404 });
    }

    // Check if user is author or admin
    const isAdmin = token.role === "admin";
    const isAuthor = existingUpdate.authorId === token.sub;

    if (!isAdmin && !isAuthor) {
      return NextResponse.json(
        { error: "You can only delete your own updates." },
        { status: 403 }
      );
    }

    await collection.deleteOne({ _id: new ObjectId(id) });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logError("Failed to delete update", error, {
      route: "/api/updates/[id]",
      method: "DELETE",
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to delete right now." },
      { status: 500 }
    );
  }
}
