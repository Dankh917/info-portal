import { NextResponse } from "next/server";
import { getUpdatesCollection, getTagsCollection } from "@/lib/mongo";
import { getToken } from "next-auth/jwt";

export async function GET(request) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

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
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const title = body?.title?.trim();
    const message = body?.message?.trim();
    const happensAtInput = body?.happensAt;
    const tagsInput = body?.tags;

    if (!title || !message) {
      return NextResponse.json(
        { error: "Title and message are required." },
        { status: 400 },
      );
    }

    let happensAt = null;
    if (happensAtInput) {
      const parsed = new Date(happensAtInput);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Event time must be a valid date." },
          { status: 400 },
        );
      }
      happensAt = parsed;
    }

    const rawTags = Array.isArray(tagsInput)
      ? tagsInput
      : typeof tagsInput === "string"
        ? tagsInput.split(",")
        : [];

    const tags = Array.from(
      new Set(
        rawTags
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 12),
      ),
    );

    if (tags.length === 0) {
      return NextResponse.json(
        { error: "At least one tag is required." },
        { status: 400 },
      );
    }

    const normalizedTags = tags.map((tag) => tag.toLowerCase());
    const tagsCollection = await getTagsCollection();
    const matchedTags = await tagsCollection
      .find({ normalizedName: { $in: normalizedTags } })
      .project({ name: 1, color: 1, icon: 1, normalizedName: 1 })
      .toArray();

    if (matchedTags.length !== normalizedTags.length) {
      return NextResponse.json(
        { error: "One or more tags are invalid. Refresh and try again." },
        { status: 400 },
      );
    }

    const resolvedTags = matchedTags.map((tag) => ({
      name: tag.name,
      color: tag.color || "#22c55e",
      icon: tag.icon || "🏷️",
    }));

    const collection = await getUpdatesCollection();
    const now = new Date();
    const doc = { title, message, createdAt: now, tags: resolvedTags };
    if (happensAt) {
      doc.happensAt = happensAt;
    }

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
