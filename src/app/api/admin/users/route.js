import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getToken } from "next-auth/jwt";
import { clientPromise } from "@/lib/mongo";

const dbName = process.env.MONGODB_DB || "info-portal";

async function requireAdmin(request) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  if (token.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }

  return { token };
}

export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) {
    return error;
  }

  try {
    const client = await clientPromise;
    const users = await client
      .db(dbName)
      .collection("users")
      .find({})
      .project({ email: 1, name: 1, image: 1, role: 1, department: 1, departments: 1 })
      .sort({ email: 1 })
      .toArray();

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Failed to load users", error);
    return NextResponse.json(
      { error: "Unable to load users right now." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  const { error } = await requireAdmin(request);
  if (error) {
    return error;
  }

  try {
    const body = await request.json();
    const id = body?.id;
    const email = body?.email?.trim();
    const role = body?.role?.trim();
    const departmentsInput = body?.departments ?? body?.department;
    const normalizeDepartments = (value) => {
      if (Array.isArray(value)) {
        return Array.from(
          new Set(
            value
              .map((d) => d?.trim?.())
              .filter(Boolean)
              .slice(0, 8),
          ),
        );
      }
      if (typeof value === "string") {
        return Array.from(
          new Set(
            value
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean)
              .slice(0, 8),
          ),
        );
      }
      return [];
    };
    const departments = normalizeDepartments(departmentsInput);

    if (!id && !email) {
      return NextResponse.json(
        { error: "User id or email is required." },
        { status: 400 },
      );
    }

    if (role && !["user", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be user or admin." },
        { status: 400 },
      );
    }

    const update = {};
    if (role) {
      update.role = role;
    }
    if (departmentsInput !== undefined) {
      update.departments = departments;
      update.department = departments[0] || null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update." },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const query = id ? { _id: new ObjectId(id) } : { email };
    const result = await client
      .db(dbName)
      .collection("users")
      .updateOne(query, { $set: update });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to update user", error);
    return NextResponse.json(
      { error: "Unable to update user right now." },
      { status: 500 },
    );
  }
}
