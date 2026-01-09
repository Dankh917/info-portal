import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getDepartmentsCollection } from "@/lib/mongo";

const DEFAULT_DEPARTMENTS = [
  { name: "General" },
  { name: "HR" },
  { name: "Engineering" },
  { name: "Finance" },
  { name: "Marketing" },
  { name: "Operations" },
];

const normalizeName = (name) => name.toLowerCase();

async function ensureDefaultDepartments(collection) {
  const operations = DEFAULT_DEPARTMENTS.map((dept) => ({
    updateOne: {
      filter: { normalizedName: normalizeName(dept.name) },
      update: {
        $setOnInsert: {
          name: dept.name,
          normalizedName: normalizeName(dept.name),
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

export async function GET(request) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const collection = await getDepartmentsCollection();
    await ensureDefaultDepartments(collection);

    const departments = await collection
      .find({})
      .project({ name: 1, normalizedName: 1 })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json({ departments });
  } catch (error) {
    console.error("Failed to fetch departments", error);
    return NextResponse.json
    (
      { error: "Unable to load departments right now." },
      { status: 500 },
    );
  }
}
