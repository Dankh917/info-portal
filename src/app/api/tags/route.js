import { NextResponse } from "next/server";
import { getTagsCollection } from "@/lib/mongo";

const DEFAULT_TAGS = [
  { name: "Product", color: "#22c55e", icon: "📦" },
  { name: "Release", color: "#6366f1", icon: "🚀" },
  { name: "Incident", color: "#f97316", icon: "⚠️" },
  { name: "Maintenance", color: "#eab308", icon: "🛠️" },
  { name: "Announcement", color: "#06b6d4", icon: "📣" },
  { name: "Culture", color: "#ec4899", icon: "🎉" },
];

const FALLBACK_COLORS = [
  "#22c55e",
  "#6366f1",
  "#f97316",
  "#ec4899",
  "#06b6d4",
  "#f59e0b",
  "#a855f7",
  "#0ea5e9",
];

function normalizeName(name) {
  return name.toLowerCase();
}

async function ensureDefaultTags(collection) {
  const operations = DEFAULT_TAGS.map((tag) => ({
    updateOne: {
      filter: { normalizedName: normalizeName(tag.name) },
      update: {
        $setOnInsert: {
          ...tag,
          normalizedName: normalizeName(tag.name),
          createdAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  if (operations.length) {
    await collection.bulkWrite(operations);
  }
}

export async function GET() {
  try {
    const collection = await getTagsCollection();
    await ensureDefaultTags(collection);
    const tags = await collection
      .find({})
      .project({ name: 1, color: 1, icon: 1 })
      .sort({ name: 1 })
      .toArray();
    return NextResponse.json({ tags });
  } catch (error) {
    console.error("Failed to fetch tags", error);
    return NextResponse.json(
      { error: "Unable to load tags right now." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = body?.name?.trim();

    if (!name) {
      return NextResponse.json(
        { error: "Tag name is required." },
        { status: 400 },
      );
    }

    if (name.length > 48) {
      return NextResponse.json(
        { error: "Tag name is too long." },
        { status: 400 },
      );
    }

    const normalizedName = normalizeName(name);
    const collection = await getTagsCollection();

    const existing = await collection.findOne({ normalizedName });
    if (existing) {
      return NextResponse.json(
        { error: "That tag already exists." },
        { status: 409 },
      );
    }

    const tagCount = await collection.countDocuments();
    const color =
      body?.color?.trim() ||
      FALLBACK_COLORS[tagCount % FALLBACK_COLORS.length] ||
      "#22c55e";
    const icon = body?.icon?.trim() || "🏷️";

    const doc = {
      name,
      normalizedName,
      color,
      icon,
      createdAt: new Date(),
    };
    const { insertedId } = await collection.insertOne(doc);

    return NextResponse.json(
      {
        tag: { _id: insertedId, name, color, icon, createdAt: doc.createdAt },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to save tag", error);
    return NextResponse.json(
      { error: "Unable to save tag right now." },
      { status: 500 },
    );
  }
}
