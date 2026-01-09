import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  clientPromise,
  getProjectsCollection,
  getDepartmentsCollection,
} from "@/lib/mongo";
import { ObjectId } from "mongodb";

const dbName = process.env.MONGODB_DB || "info-portal";

const STATUS_OPTIONS = ["planned", "in_progress", "blocked", "done"];

function normalizeDepartments(input) {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((d) => d?.trim?.())
          .filter(Boolean)
          .slice(0, 8),
      ),
    );
  }
  if (typeof input === "string") {
    return Array.from(
      new Set(
        input
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean)
          .slice(0, 8),
      ),
    );
  }
  return [];
}

function normalizeTags(input) {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((t) => t?.trim?.())
          .filter(Boolean)
          .slice(0, 10),
      ),
    );
  }
  if (typeof input === "string") {
    return Array.from(
      new Set(
        input
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10),
      ),
    );
  }
  return [];
}

async function resolveDepartments(departments) {
  const normalized = departments.map((d) => d.toLowerCase());
  const collection = await getDepartmentsCollection();
  const matched = await collection
    .find({ normalizedName: { $in: normalized } })
    .project({ name: 1, normalizedName: 1 })
    .toArray();
  if (matched.length !== normalized.length) {
    return null;
  }
  return matched.map((d) => d.name);
}

async function resolveAssignments(assignments, allowedDepartments) {
  if (!Array.isArray(assignments) || assignments.length === 0) return [];

  const client = await clientPromise;
  const usersCollection = client.db(dbName).collection("users");
  const results = [];

  for (const item of assignments) {
    const userId = item?.userId;
    if (!userId) continue;
    const userRecord = await usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { projection: { name: 1, email: 1, departments: 1, department: 1 } },
    );
    if (!userRecord) continue;

    const userDepartments = Array.isArray(userRecord.departments)
      ? userRecord.departments.filter(Boolean)
      : userRecord.department
        ? [userRecord.department]
        : [];
    const overlap = userDepartments.some((dept) => allowedDepartments.includes(dept));
    if (!overlap) {
      continue;
    }

    results.push({
      userId: userRecord._id.toString(),
      name: userRecord.name || userRecord.email || "User",
      email: userRecord.email || "",
      departments: userDepartments,
      instructions: Array.isArray(item.instructions) ? item.instructions : [],
    });
  }

  return results;
}

export async function GET(request) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      console.warn("[API/projects] GET: Unauthorized access attempt");
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    console.log("[API/projects] GET: Fetching projects for user", {
      userId: token.sub,
      role: token.role,
      departments: token.departments,
    });

    const collection = await getProjectsCollection();
    const isAdmin = token.role === "admin";
    const isPm = token.role === "pm";
    const pmDepartments = Array.isArray(token.departments) ? token.departments : [];

    const query =
      isAdmin
        ? {}
        : isPm
          ? pmDepartments.length
            ? { departments: { $in: pmDepartments } }
            : { _id: null }
          : {
              "assignments.userId": token.sub,
            };

    const projects = await collection
      .find(query)
      .project({
        title: 1,
        summary: 1,
        status: 1,
        departments: 1,
        dueDate: 1,
        tags: 1,
        createdAt: 1,
        updatedAt: 1,
        assignments: 1,
        generalInstructions: 1,
        createdBy: 1,
      })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    console.log("[API/projects] GET: Successfully fetched projects", {
      count: projects.length,
      userId: token.sub,
    });

    const normalized = projects.map((p) => {
      const baseAssignments = (p.assignments || []).map((a) => ({
        ...a,
        userId: a.userId?.toString?.() || a.userId,
      }));

      const filteredAssignments = baseAssignments;

      return {
        ...p,
        _id: p._id?.toString?.() || p._id,
        assignments: filteredAssignments,
        generalInstructions: (p.generalInstructions || []).map((ins) => ({
          ...ins,
          _id: ins._id?.toString?.() || ins._id,
        })),
      };
    });

    return NextResponse.json({ projects: normalized });
  } catch (error) {
    console.error("[API/projects] GET: Error fetching projects", {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: "Unable to load projects right now." },
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

    const isAdmin = token.role === "admin";
    const isPm = token.role === "pm";
    const pmDepartments = Array.isArray(token.departments) ? token.departments : [];

    if (!isAdmin && !isPm) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (isPm && pmDepartments.length === 0) {
      return NextResponse.json({ error: "No departments assigned." }, { status: 403 });
    }

    const body = await request.json();
    const title = body?.title?.trim();
    const summary = body?.summary?.trim();
    const status = body?.status?.toLowerCase?.() || "planned";
    const departmentsInput = body?.departments;
    const dueDateInput = body?.dueDate;
    const tags = normalizeTags(body?.tags);
    const assignmentsInput = Array.isArray(body?.assignments) ? body.assignments : [];

    if (!title) {
      return NextResponse.json(
        { error: "Title is required." },
        { status: 400 },
      );
    }

    if (!STATUS_OPTIONS.includes(status)) {
      return NextResponse.json(
        { error: "Status is invalid." },
        { status: 400 },
      );
    }

    const departments = normalizeDepartments(departmentsInput);
    if (departments.length === 0) {
      return NextResponse.json(
        { error: "At least one department is required." },
        { status: 400 },
      );
    }

    const resolvedDepartments = await resolveDepartments(departments);
    if (!resolvedDepartments) {
      return NextResponse.json(
        { error: "One or more departments are invalid." },
        { status: 400 },
      );
    }
    if (isPm && resolvedDepartments.some((dept) => !pmDepartments.includes(dept))) {
      return NextResponse.json(
        { error: "PMs can only create projects in their departments." },
        { status: 403 },
      );
    }

    let dueDate = null;
    if (dueDateInput) {
      const parsed = new Date(dueDateInput);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Due date must be a valid date." },
          { status: 400 },
        );
      }
      dueDate = parsed;
    }

    const assignments = await resolveAssignments(assignmentsInput, resolvedDepartments);

    const now = new Date();
    const doc = {
      title,
      summary: summary || "",
      status,
      departments: resolvedDepartments,
      dueDate,
      tags,
      assignments,
      generalInstructions: [],
      createdAt: now,
      updatedAt: now,
      createdBy: {
        id: token.sub,
        name: token.name || token.email || "Admin",
        email: token.email || null,
      },
    };

    const collection = await getProjectsCollection();
    const { insertedId } = await collection.insertOne(doc);

    return NextResponse.json(
      { project: { _id: insertedId.toString(), ...doc } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create project", error);
    return NextResponse.json(
      { error: "Unable to create project right now." },
      { status: 500 },
    );
  }
}
