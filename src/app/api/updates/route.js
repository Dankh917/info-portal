import { NextResponse } from "next/server";
import {
  clientPromise,
  getUpdatesCollection,
  getTagsCollection,
  getDepartmentsCollection,
} from "@/lib/mongo";
import { getToken } from "next-auth/jwt";
import { ObjectId } from "mongodb";

const dbName = process.env.MONGODB_DB || "info-portal";

export async function GET(request) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    // Refresh departments from DB each request so admin changes apply immediately.
    let dbDepartments = [];
    try {
      const client = await clientPromise;
      const usersCollection = client.db(dbName).collection("users");
      const userQuery = token.sub ? { _id: new ObjectId(token.sub) } : { email: token.email };
      const userRecord = await usersCollection.findOne(userQuery, {
        projection: { departments: 1, department: 1 },
      });
      if (userRecord) {
        if (Array.isArray(userRecord.departments)) {
          dbDepartments = userRecord.departments.filter(Boolean);
        } else if (userRecord.department) {
          dbDepartments = [userRecord.department];
        }
      }
    } catch (lookupError) {
      console.error("Failed to load user departments", lookupError);
    }

    const collection = await getUpdatesCollection();

    const userDepartments = dbDepartments.length
      ? dbDepartments
      : Array.isArray(token.departments)
        ? token.departments
        : token.department
          ? [token.department]
          : [];

    const filters = [
      { departments: { $in: ["General"] } },
      { authorId: token.sub },
    ];

    if (userDepartments.length) {
      filters.push({ departments: { $in: userDepartments } });
    }

    const updates = await collection
      .find({ $or: filters })
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
    const departmentsInput = body?.departments;

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
      icon: tag.icon || "???",
    }));

    const rawDepartments = Array.isArray(departmentsInput)
      ? departmentsInput
      : typeof departmentsInput === "string"
        ? departmentsInput.split(",")
        : [];

    const departments = Array.from(
      new Set(
        rawDepartments
          .map((dept) => dept.trim())
          .filter(Boolean)
          .slice(0, 8),
      ),
    );

    const departmentsToUse = departments.length ? departments : ["General"];

    const departmentsCollection = await getDepartmentsCollection();
    const normalizedDepartments = departmentsToUse.map((dept) => dept.toLowerCase());
    const matchedDepartments = await departmentsCollection
      .find({ normalizedName: { $in: normalizedDepartments } })
      .project({ name: 1, normalizedName: 1 })
      .toArray();

    if (matchedDepartments.length !== normalizedDepartments.length) {
      return NextResponse.json(
        { error: "One or more departments are invalid. Refresh and try again." },
        { status: 400 },
      );
    }

    const collection = await getUpdatesCollection();
    const now = new Date();
    const doc = {
      title,
      message,
      createdAt: now,
      tags: resolvedTags,
      departments: matchedDepartments.map((dept) => dept.name),
      authorId: token.sub,
      authorName: token.name || token.email || "Unknown",
    };
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
