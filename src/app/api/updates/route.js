import { NextResponse } from "next/server";
import { getUpdatesCollection } from "@/lib/mongo";

export async function GET() {
  try {
    const collection = await getUpdatesCollection();
    const updates = await collection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ updates });
  } catch (error) {
    console.error("Failed to fetch updates", error);
    return NextResponse.json(
      { error: "Unable to load updates right now." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const title = body?.title?.trim();
    const message = body?.message?.trim();

    if (!title || !message) {
      return NextResponse.json(
        { error: "Title and message are required." },
        { status: 400 },
      );
    }

    const collection = await getUpdatesCollection();
    const now = new Date();
    const doc = { title, message, createdAt: now };

    const { insertedId } = await collection.insertOne(doc);

    return NextResponse.json(
      { update: { _id: insertedId, ...doc } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to save update", error);
    return NextResponse.json(
      { error: "Unable to save update right now." },
      { status: 500 },
    );
  }
}
