import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getProjectsCollection } from "@/lib/mongo";
import { ObjectId } from "mongodb";

export async function POST(request, context) {
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

    const body = await request.json();
    const text = body?.text?.trim();
    const scope = body?.scope === "general" ? "general" : "assignment";
    const targetUserId = body?.userId;

    if (!text) {
      return NextResponse.json({ error: "Instruction text is required." }, { status: 400 });
    }

    const collection = await getProjectsCollection();
    const project = await collection.findOne({ _id: new ObjectId(id) });

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const isAdmin = token.role === "admin";
    const isAssigned = (project.assignments || []).some((a) => a.userId === token.sub);
    if (!isAdmin && !isAssigned) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const instruction = {
      _id: new ObjectId(),
      text,
      authorId: token.sub,
      authorName: token.name || token.email || "User",
      createdAt: new Date(),
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

    // Assignment-scoped instruction
    const assignments = project.assignments || [];
    const targetUser =
      targetUserId ||
      (isAssigned ? token.sub : null);

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
    console.error("Failed to add instruction", error);
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

  try {
    const token = await getToken({
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

    if (!instructionId) {
      return NextResponse.json({ error: "Instruction id is required." }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Instruction text is required." }, { status: 400 });
    }

    const collection = await getProjectsCollection();
    const project = await collection.findOne({ _id: new ObjectId(id) });

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const isAdmin = token.role === "admin";
    const isOwner = project.createdBy?.id === token.sub;
    const isAssigned = (project.assignments || []).some((a) => a.userId === token.sub);
    if (!isAdmin && !isOwner && !isAssigned) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (scope === "general") {
      const general = project.generalInstructions || [];
      const idx = general.findIndex((g) => g._id?.toString?.() === instructionId);
      if (idx === -1) {
        return NextResponse.json({ error: "Instruction not found." }, { status: 404 });
      }
      const targetInstruction = general[idx];
      const canEdit =
        isAdmin ||
        isOwner ||
        targetInstruction.authorId === token.sub;
      if (!canEdit) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      general[idx].text = text;
      general[idx].updatedAt = new Date();

      await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { generalInstructions: general, updatedAt: new Date() } },
      );
      return NextResponse.json({ ok: true });
    }

    // Assignment scope
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
    const canEdit =
      isAdmin ||
      isOwner ||
      targetInstruction.authorId === token.sub;
    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    instructions[insIndex].text = text;
    instructions[insIndex].updatedAt = new Date();
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
    console.error("Failed to update instruction", error);
    return NextResponse.json(
      { error: "Unable to update instruction right now." },
      { status: 500 },
    );
  }
}
