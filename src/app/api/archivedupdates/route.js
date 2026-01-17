import { NextResponse } from "next/server";
import {
  clientPromise,
  getUpdatesCollection,
} from "@/lib/mongo";
import { getToken } from "next-auth/jwt";
import { ObjectId } from "mongodb";
import { logError } from "@/lib/logger";

const dbName = process.env.MONGODB_DB || "info-portal";

export async function GET(request) {
  let token;
  try {
    token = await getToken({
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
      await logError("Failed to load user departments", lookupError, {
        route: "/api/archivedupdates",
        method: request?.method,
        url: request?.url,
        userId: token?.sub,
      });
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

    // Get only archived updates (older than 1 day)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const archivedUpdates = await collection
      .find({ 
        $or: filters,
        createdAt: { $lt: oneDayAgo }
      })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ updates: archivedUpdates });
  } catch (error) {
    await logError("Failed to fetch archived updates", error, {
      route: "/api/archivedupdates",
      method: request?.method,
      url: request?.url,
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to load archived updates right now." },
      { status: 500 },
    );
  }
}
