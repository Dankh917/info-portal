import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { clientPromise } from "@/lib/mongo";
import { logError } from "@/lib/logger";

const dbName = process.env.MONGODB_DB || "info-portal";

export async function GET(request) {
  let token;
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token?.sub) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const client = await clientPromise;
    const usersCollection = client.db(dbName).collection("users");

    const users = await usersCollection
      .find(
        {},
        {
          projection: {
            _id: 1,
            name: 1,
            email: 1,
            username: 1,
            normalizedUsername: 1,
            bio: 1,
            profileImage: 1,
            image: 1,
            role: 1,
            departments: 1,
          },
        }
      )
      .limit(100)
      .toArray();

    const sanitized = users.map((user) => ({
      _id: user._id.toString(),
      name: user.name || user.email || "User",
      email: user.email || "",
      username: user.username || user.normalizedUsername || user.email || user._id.toString(),
      bio: user.bio || "",
      image: user.profileImage || user.image || "",
      role: user.role || "general",
      departments: Array.isArray(user.departments) ? user.departments : ["General"],
    }));

    return NextResponse.json({ users: sanitized });
  } catch (error) {
    await logError("Failed to load users", error, {
      route: "/api/users",
      method: request?.method,
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to load users right now." },
      { status: 500 }
    );
  }
}
