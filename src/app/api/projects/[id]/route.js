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
    const userId = item?.userId || item?._id;
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

    const existingInstructions = Array.isArray(item.instructions) ? item.instructions : [];

    results.push({
      userId: userRecord._id.toString(),
      name: userRecord.name || userRecord.email || "User",
      email: userRecord.email || "",
      departments: userDepartments,
      instructions: existingInstructions,
    });
  }

  return results;
}

export async function GET(request, context) {
  const { id } = await context?.params;
  if (!id) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const collection = await getProjectsCollection();
    const project = await collection.findOne({ _id: new ObjectId(id) });

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const isAdmin = token.role === "admin";
    const assigned = (project.assignments || []).some((a) => a.userId === token.sub);
    if (!isAdmin && !assigned) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const normalizedAssignments = (project.assignments || []).map((a) => ({
      ...a,
      userId: a.userId?.toString?.() || a.userId,
    }));

    const visibleAssignments = isAdmin
      ? normalizedAssignments
      : normalizedAssignments.filter((a) => a.userId === token.sub);

    return NextResponse.json({
      project: {
        ...project,
        _id: project._id?.toString?.() || project._id,
        assignments: visibleAssignments,
        generalInstructions: (project.generalInstructions || []).map((ins) => ({
          ...ins,
          _id: ins._id?.toString?.() || ins._id,
        })),
        createdBy: project.createdBy || null,
      },
    });
  } catch (error) {
    console.error("Failed to fetch project", error);
    return NextResponse.json(
      { error: "Unable to load project right now." },
      { status: 500 },
    );
  }
}

export async function PATCH(request, context) {
  const { id } = await context?.params;
  if (!id) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const collection = await getProjectsCollection();
    const existingProject = await collection.findOne({ _id: new ObjectId(id) });
    if (!existingProject) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const isOwner = existingProject.createdBy?.id === token.sub;
    const isAdmin = token.role === "admin";
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json();
    const title = body?.title?.trim();
    const summary = body?.summary?.trim();
    const status = body?.status?.toLowerCase?.();
    const departmentsInput = body?.departments;
    const dueDateInput = body?.dueDate;
    const tags = normalizeTags(body?.tags);
    const assignmentsInput = Array.isArray(body?.assignments) ? body.assignments : null;

    const update = {};

    if (title !== undefined) {
      if (!title) {
        return NextResponse.json(
          { error: "Title is required." },
          { status: 400 },
        );
      }
      update.title = title;
    }

    if (summary !== undefined) {
      update.summary = summary || "";
    }

    if (status !== undefined) {
      if (!STATUS_OPTIONS.includes(status)) {
        return NextResponse.json(
          { error: "Status is invalid." },
          { status: 400 },
        );
      }
      update.status = status;
    }

    if (tags !== undefined) {
      update.tags = tags;
    }

    if (dueDateInput !== undefined) {
      if (dueDateInput === null) {
        update.dueDate = null;
      } else {
        const parsed = new Date(dueDateInput);
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json(
            { error: "Due date must be a valid date." },
            { status: 400 },
          );
        }
        update.dueDate = parsed;
      }
    }

    let resolvedDepartments = null;
    if (departmentsInput !== undefined) {
      const departments = normalizeDepartments(departmentsInput);
      if (departments.length === 0) {
        return NextResponse.json(
          { error: "At least one department is required." },
          { status: 400 },
        );
      }
      resolvedDepartments = await resolveDepartments(departments);
      if (!resolvedDepartments) {
        return NextResponse.json(
          { error: "One or more departments are invalid." },
          { status: 400 },
        );
      }
      update.departments = resolvedDepartments;
    }

    if (assignmentsInput !== null) {
      const departmentsForAssignment =
        resolvedDepartments || existingProject.departments || [];

      const allowedDepartments = Array.isArray(departmentsForAssignment)
        ? departmentsForAssignment
        : [];

      const assignments = await resolveAssignments(assignmentsInput, allowedDepartments);
      update.assignments = assignments;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update." },
        { status: 400 },
      );
    }

    update.updatedAt = new Date();
    update.updatedBy = {
      id: token.sub,
      name: token.name || token.email || "Admin",
      email: token.email || null,
    };

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: update },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to update project", error);
    return NextResponse.json(
      { error: "Unable to update project right now." },
      { status: 500 },
    );
  }
}

export async function DELETE(request, context) {
  const { id } = await context?.params;
  if (!id) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (token.role !== "admin") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const collection = await getProjectsCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete project", error);
    return NextResponse.json(
      { error: "Unable to delete project right now." },
      { status: 500 },
    );
  }
}
