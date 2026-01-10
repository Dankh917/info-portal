import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getProjectsCollection } from "@/lib/mongo";
import { ObjectId } from "mongodb";
import { logError } from "@/lib/logger";

const canPmAccessProject = (project, token) => {
  const isPm = token.role === "pm";
  if (!isPm) return false;
  const pmDepartments = Array.isArray(token.departments) ? token.departments : [];
  return (
    Array.isArray(project.departments) &&
    project.departments.length > 0 &&
    project.departments.every((dept) => pmDepartments.includes(dept))
  );
};

const normalizeDocumentIds = (input) => {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
        .slice(0, 10),
    ),
  );
};

export async function POST(request, context) {
  const { id } = await context?.params;
  if (!id) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  let token;
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const text = body?.text?.trim();
    const scope = body?.scope === "general" ? "general" : "assignment";
    const targetUserId = body?.userId;
    const documentIds = normalizeDocumentIds(body?.documentIds);

    if (!text) {
      return NextResponse.json({ error: "Instruction text is required." }, { status: 400 });
    }

    const collection = await getProjectsCollection();
    const project = await collection.findOne({ _id: new ObjectId(id) });

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const isAdmin = token.role === "admin";
    const pmHasAccess = canPmAccessProject(project, token);
    const isAssigned = (project.assignments || []).some((a) => a.userId === token.sub);
    if (!isAdmin && !pmHasAccess && !isAssigned) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const instruction = {
      _id: new ObjectId(),
      text,
      authorId: token.sub,
      authorName: token.name || token.email || "User",
      createdAt: new Date(),
      updatedAt: new Date(),
      done: false,
      doneAt: null,
      documents: documentIds,
    };

    if (scope === "general") {
      await collection.updateOne(
        { _id: new ObjectId(id) },
        {
          $push: { generalInstructions: instruction },
          $set: { updatedAt: new Date() },
        },
      );
      return NextResponse.json({ ok: true, instruction });
    }

    const assignments = project.assignments || [];
    const targetUser = targetUserId || (isAssigned ? token.sub : null);
    const assignmentIndex = assignments.findIndex((a) => a.userId === targetUser);
    if (assignmentIndex === -1) {
      return NextResponse.json(
        { error: "You must be assigned to add instructions here." },
        { status: 403 },
      );
    }

    const updatePath = `assignments.${assignmentIndex}.instructions`;
    await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $push: { [updatePath]: instruction },
        $set: { updatedAt: new Date() },
      },
    );

    return NextResponse.json({ ok: true, instruction });
  } catch (error) {
    await logError("Failed to add instruction", error, {
      route: `/api/projects/${id}/instructions`,
      method: request?.method,
      url: request?.url,
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to add instruction right now." },
      { status: 500 },
    );
  }
}

export async function PATCH(request, context) {
  const { id } = await context?.params;
  if (!id) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  let token;
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const instructionId = body?.instructionId;
    const text = body?.text?.trim();
    const scope = body?.scope === "general" ? "general" : "assignment";
    const targetUserId = body?.userId;
    const done = typeof body?.done === "boolean" ? body.done : null;
    const documentIds = normalizeDocumentIds(body?.documentIds);
    const hasDocumentUpdate = Array.isArray(body?.documentIds);

    if (!instructionId) {
      return NextResponse.json({ error: "Instruction id is required." }, { status: 400 });
    }
    if (!text && done === null && !hasDocumentUpdate) {
      return NextResponse.json({ error: "Instruction update is required." }, { status: 400 });
    }

    const collection = await getProjectsCollection();
    const project = await collection.findOne({ _id: new ObjectId(id) });

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const isAdmin = token.role === "admin";
    const pmHasAccess = canPmAccessProject(project, token);
    const isOwner = project.createdBy?.id === token.sub;
    const isAssigned = (project.assignments || []).some((a) => a.userId === token.sub);
    if (!isAdmin && !isOwner && !pmHasAccess && !isAssigned) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (scope === "general") {
      if (done !== null) {
        return NextResponse.json(
          { error: "Done status is only available for assignment instructions." },
          { status: 400 },
        );
      }
      const general = project.generalInstructions || [];
      const idx = general.findIndex((g) => g._id?.toString?.() === instructionId);
      if (idx === -1) {
        return NextResponse.json({ error: "Instruction not found." }, { status: 404 });
      }
      const targetInstruction = general[idx];
      const canEdit =
        isAdmin ||
        isOwner ||
        pmHasAccess ||
        targetInstruction.authorId === token.sub;
      if (!canEdit) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      if (text) {
        general[idx].text = text;
        general[idx].updatedAt = new Date();
      }
      if (hasDocumentUpdate) {
        general[idx].documents = documentIds;
        general[idx].updatedAt = new Date();
      }

      await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { generalInstructions: general, updatedAt: new Date() } },
      );
      return NextResponse.json({ ok: true });
    }

    const assignments = project.assignments || [];
    const targetAssignmentId = targetUserId || token.sub;
    const assignmentIndex = assignments.findIndex((a) => a.userId === targetAssignmentId);
    if (assignmentIndex === -1) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const instructions = assignments[assignmentIndex].instructions || [];
    const insIndex = instructions.findIndex((ins) => ins._id?.toString?.() === instructionId);
    if (insIndex === -1) {
      return NextResponse.json({ error: "Instruction not found." }, { status: 404 });
    }

    const targetInstruction = instructions[insIndex];
    if (done !== null) {
      if (targetAssignmentId !== token.sub) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      instructions[insIndex].done = done;
      instructions[insIndex].doneAt = done ? new Date() : null;
      instructions[insIndex].updatedAt = new Date();
    } else {
      const canEdit =
        isAdmin ||
        isOwner ||
        pmHasAccess ||
        targetInstruction.authorId === token.sub;
      if (!canEdit) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      if (text) {
        instructions[insIndex].text = text;
        instructions[insIndex].updatedAt = new Date();
      }
      if (hasDocumentUpdate) {
        instructions[insIndex].documents = documentIds;
        instructions[insIndex].updatedAt = new Date();
      }
    }
    assignments[assignmentIndex].instructions = instructions;

    await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          [`assignments.${assignmentIndex}.instructions`]: instructions,
          updatedAt: new Date(),
        },
      },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logError("Failed to update instruction", error, {
      route: `/api/projects/${id}/instructions`,
      method: request?.method,
      url: request?.url,
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to update instruction right now." },
      { status: 500 },
    );
  }
}

export async function DELETE(request, context) {
  const { id } = await context?.params;
  if (!id) {
    return NextResponse.json({ error: "Project id is required." }, { status: 400 });
  }

  let token;
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const instructionId = body?.instructionId;
    const scope = body?.scope === "general" ? "general" : "assignment";
    const targetUserId = body?.userId;

    if (!instructionId) {
      return NextResponse.json({ error: "Instruction id is required." }, { status: 400 });
    }

    const collection = await getProjectsCollection();
    const project = await collection.findOne({ _id: new ObjectId(id) });

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const isAdmin = token.role === "admin";
    const pmHasAccess = canPmAccessProject(project, token);
    const isOwner = project.createdBy?.id === token.sub;
    if (!isAdmin && !isOwner && !pmHasAccess) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (scope === "general") {
      const general = project.generalInstructions || [];
      const nextGeneral = general.filter((g) => g._id?.toString?.() !== instructionId);

      await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { generalInstructions: nextGeneral, updatedAt: new Date() } },
      );
      return NextResponse.json({ ok: true });
    }

    if (!targetUserId) {
      return NextResponse.json({ error: "Assignment user is required." }, { status: 400 });
    }

    const assignments = project.assignments || [];
    const assignmentIndex = assignments.findIndex((a) => a.userId === targetUserId);
    if (assignmentIndex === -1) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const instructions = assignments[assignmentIndex].instructions || [];
    const nextInstructions = instructions.filter((ins) => ins._id?.toString?.() !== instructionId);

    await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          [`assignments.${assignmentIndex}.instructions`]: nextInstructions,
          updatedAt: new Date(),
        },
      },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logError("Failed to delete instruction", error, {
      route: `/api/projects/${id}/instructions`,
      method: request?.method,
      url: request?.url,
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to delete instruction right now." },
      { status: 500 },
    );
  }
}
