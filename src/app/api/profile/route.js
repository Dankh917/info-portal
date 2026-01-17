import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { ObjectId } from "mongodb";
import fs from "fs/promises";
import path from "path";
import { clientPromise } from "@/lib/mongo";
import { logError } from "@/lib/logger";
import { buildProfilePayload } from "./profile-service";

const dbName = process.env.MONGODB_DB || "info-portal";
const AVATAR_DIR = path.join(process.cwd(), "public", "profile-photos");
const MAX_AVATAR_SIZE = 4 * 1024 * 1024; // 4 MB

const cleanString = (value, max = 180) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
};

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

    const payload = await buildProfilePayload(token.sub, token.sub, token.role);
    if (payload?.error) {
      return NextResponse.json({ error: payload.error }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    await logError("Failed to load profile", error, {
      route: "/api/profile",
      method: request?.method,
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to load profile right now." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  let token;
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token?.sub) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const formData = await request.formData();
    const name = cleanString(formData.get("name"), 90) || null;
    const bio = cleanString(formData.get("bio"), 600);
    const phone = cleanString(formData.get("phone"), 20) || null;
    const file = formData.get("picture");

    const update = {};
    if (name) update.name = name;
    update.bio = bio || "";
    if (phone) update.phone = phone;

    let newAvatarPath = null;
    let oldAvatarPath = null;

    if (file && typeof file === "object" && file.name) {
      if (file.type !== "image/png") {
        return NextResponse.json(
          { error: "Profile picture must be a PNG file." },
          { status: 400 },
        );
      }
      if (file.size > MAX_AVATAR_SIZE) {
        return NextResponse.json(
          { error: "Profile picture is too large (max 4MB)." },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.mkdir(AVATAR_DIR, { recursive: true });
      const filename = `${token.sub}-${Date.now()}.png`;
      const filePath = path.join(AVATAR_DIR, filename);
      await fs.writeFile(filePath, buffer);
      newAvatarPath = `/profile-photos/${filename}`;
    }

    const client = await clientPromise;
    const usersCollection = client.db(dbName).collection("users");

    // Validate name uniqueness
    if (name) {
      const existingWithName = await usersCollection.findOne(
        { name: name, _id: { $ne: new ObjectId(token.sub) } }
      );
      if (existingWithName) {
        return NextResponse.json(
          { error: "This name is already taken. Please choose a different name." },
          { status: 409 }
        );
      }
    }

    // Validate phone format (exactly 10 digits)
    if (phone && phone.replace(/\D/g, "").length !== 10) {
      return NextResponse.json(
        { error: "Phone must be exactly 10 digits." },
        { status: 400 }
      );
    }

    const userRecord = await usersCollection.findOne(new ObjectId(token.sub), {
      projection: { profileImage: 1 },
    });
    if (!userRecord) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (newAvatarPath) {
      oldAvatarPath = userRecord.profileImage || null;
      update.profileImage = newAvatarPath;
      update.image = newAvatarPath;
    }

    await usersCollection.updateOne(
      { _id: new ObjectId(token.sub) },
      {
        $set: {
          ...update,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          friends: [],
          incomingFriendRequests: [],
          outgoingFriendRequests: [],
        },
      },
    );

    if (oldAvatarPath && newAvatarPath && oldAvatarPath !== newAvatarPath) {
      const absoluteOld = path.join(process.cwd(), "public", oldAvatarPath.replace(/^\//, ""));
      try {
        await fs.unlink(absoluteOld);
      } catch (error) {
        await logError("Unable to delete old avatar", error, {
          route: "/api/profile",
          userId: token?.sub,
          oldPath: oldAvatarPath,
        });
      }
    }

    const payload = await buildProfilePayload(token.sub, token.sub, token.role);
    if (payload?.error) {
      return NextResponse.json({ error: payload.error }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    await logError("Failed to update profile", error, {
      route: "/api/profile",
      method: request?.method,
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to update profile right now." },
      { status: 500 },
    );
  }
}
