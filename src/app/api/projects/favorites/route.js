import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { clientPromise, getProjectsCollection } from "@/lib/mongo";
import { ObjectId } from "mongodb";
import { logError } from "@/lib/logger";

const dbName = process.env.MONGODB_DB || "info-portal";
const MAX_FAVORITES = 2;

export async function PATCH(request) {
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
    const projectId = body?.projectId;
    const favorite = body?.favorite;

    if (!projectId || typeof projectId !== "string" || !ObjectId.isValid(projectId)) {
      return NextResponse.json({ error: "Project id is invalid." }, { status: 400 });
    }
    if (typeof favorite !== "boolean") {
      return NextResponse.json({ error: "Favorite flag is required." }, { status: 400 });
    }

    const projectObjectId = new ObjectId(projectId);
    const collection = await getProjectsCollection();
    const project = await collection.findOne(
      { _id: projectObjectId },
      { projection: { departments: 1, assignments: 1 } },
    );

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const isAdmin = token.role === "admin";
    const isPm = token.role === "pm";
    const pmDepartments = Array.isArray(token.departments) ? token.departments : [];
    const pmHasAccess =
      isPm &&
      Array.isArray(project.departments) &&
      project.departments.length > 0 &&
      project.departments.every((dept) => pmDepartments.includes(dept));
    const assigned = (project.assignments || []).some((a) => a.userId === token.sub);

    if (!isAdmin && !pmHasAccess && !assigned) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const client = await clientPromise;
    const usersCollection = client.db(dbName).collection("users");
    const userObjectId = new ObjectId(token.sub);
    const userRecord = await usersCollection.findOne(
      { _id: userObjectId },
      { projection: { favoriteProjectIds: 1 } },
    );

    if (!userRecord) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const currentFavorites = Array.isArray(userRecord.favoriteProjectIds)
      ? userRecord.favoriteProjectIds.map((id) => id?.toString?.() || id).filter(Boolean)
      : [];
    const uniqueFavorites = Array.from(new Set(currentFavorites));

    let nextFavorites = uniqueFavorites;
    const alreadyFavorite = uniqueFavorites.includes(projectId);

    if (favorite) {
      if (alreadyFavorite) {
        return NextResponse.json({ favoriteProjectIds: uniqueFavorites });
      }
      if (uniqueFavorites.length >= MAX_FAVORITES) {
        return NextResponse.json(
          { error: "You can only favorite up to 2 projects." },
          { status: 400 },
        );
      }
      nextFavorites = [...uniqueFavorites, projectId];
    } else if (alreadyFavorite) {
      nextFavorites = uniqueFavorites.filter((id) => id !== projectId);
    }

    if (nextFavorites !== uniqueFavorites) {
      await usersCollection.updateOne(
        { _id: userObjectId },
        { $set: { favoriteProjectIds: nextFavorites } },
      );
    }

    return NextResponse.json({ favoriteProjectIds: nextFavorites });
  } catch (error) {
    await logError("Failed to update favorite project", error, {
      route: "/api/projects/favorites",
      method: request?.method,
      url: request?.url,
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to update favorites right now." },
      { status: 500 },
    );
  }
}
