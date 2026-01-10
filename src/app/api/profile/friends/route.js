import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { ObjectId } from "mongodb";
import { clientPromise } from "@/lib/mongo";
import { logError } from "@/lib/logger";
import { buildProfilePayload } from "../profile-service";

const dbName = process.env.MONGODB_DB || "info-portal";

const toObjectId = (value) => {
  try {
    return new ObjectId(value);
  } catch (error) {
    return null;
  }
};

const asStrings = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item?.toString) return item.toString();
      return null;
    })
    .filter(Boolean);
};

const ensureUser = async (usersCollection, userId) => {
  const user = await usersCollection.findOne(new ObjectId(userId), {
    projection: {
      _id: 1,
      friends: 1,
      incomingFriendRequests: 1,
      outgoingFriendRequests: 1,
    },
  });
  return user;
};

export async function POST(request) {
  let token;
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token?.sub) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const action = body?.action || "send";
    const targetUserId = body?.userId || body?.targetUserId;
    const requesterId = body?.requesterId;

    const client = await clientPromise;
    const usersCollection = client.db(dbName).collection("users");

    if (action === "send") {
      const targetObjectId = toObjectId(targetUserId);
      if (!targetObjectId) {
        return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
      }
      if (targetUserId === token.sub) {
        return NextResponse.json({ error: "You cannot add yourself." }, { status: 400 });
      }

      const target = await ensureUser(usersCollection, targetUserId);
      if (!target) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }
      const targetFriends = new Set(asStrings(target.friends));
      if (targetFriends.has(token.sub)) {
        return NextResponse.json({ ok: true, status: "friends" });
      }
      const targetIncoming = new Set(asStrings(target.incomingFriendRequests));
      const targetOutgoing = new Set(asStrings(target.outgoingFriendRequests));
      if (targetIncoming.has(token.sub)) {
        return NextResponse.json({ ok: true, status: "pending" });
      }
      if (targetOutgoing.has(token.sub)) {
        return NextResponse.json({ ok: true, status: "incoming" });
      }

      await Promise.all([
        usersCollection.updateOne(
          { _id: targetObjectId },
          {
            $addToSet: { incomingFriendRequests: token.sub },
            $setOnInsert: { friends: [], outgoingFriendRequests: [] },
          },
        ),
        usersCollection.updateOne(
          { _id: new ObjectId(token.sub) },
          {
            $addToSet: { outgoingFriendRequests: targetUserId },
            $setOnInsert: { friends: [], incomingFriendRequests: [] },
          },
        ),
      ]);

      const payload = await buildProfilePayload(targetUserId, token.sub, token.role);
      return NextResponse.json({ ...payload, status: "pending" });
    }

    if (action === "accept") {
      const sourceId = requesterId || targetUserId;
      const sourceObjectId = toObjectId(sourceId);
      if (!sourceObjectId) {
        return NextResponse.json({ error: "Invalid requester id." }, { status: 400 });
      }

      const [viewer, requester] = await Promise.all([
        ensureUser(usersCollection, token.sub),
        ensureUser(usersCollection, sourceId),
      ]);
      if (!viewer || !requester) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }

      if (!asStrings(viewer.incomingFriendRequests).includes(sourceId)) {
        return NextResponse.json(
          { error: "No pending request to accept." },
          { status: 400 },
        );
      }

      await Promise.all([
        usersCollection.updateOne(
          { _id: new ObjectId(token.sub) },
          {
            $pull: { incomingFriendRequests: sourceId },
            $addToSet: { friends: sourceId },
            $setOnInsert: { outgoingFriendRequests: [] },
          },
        ),
        usersCollection.updateOne(
          { _id: sourceObjectId },
          {
            $pull: { outgoingFriendRequests: token.sub },
            $addToSet: { friends: token.sub },
            $setOnInsert: { incomingFriendRequests: [] },
          },
        ),
      ]);

      const payload = await buildProfilePayload(sourceId, token.sub, token.role);
      return NextResponse.json({ ...payload, status: "friends" });
    }

    if (action === "reject") {
      const sourceId = requesterId || targetUserId;
      const sourceObjectId = toObjectId(sourceId);
      if (!sourceObjectId) {
        return NextResponse.json({ error: "Invalid requester id." }, { status: 400 });
      }

      await Promise.all([
        usersCollection.updateOne(
          { _id: new ObjectId(token.sub) },
          { $pull: { incomingFriendRequests: sourceId } },
        ),
        usersCollection.updateOne(
          { _id: sourceObjectId },
          { $pull: { outgoingFriendRequests: token.sub } },
        ),
      ]);

      const payload = await buildProfilePayload(sourceId, token.sub, token.role);
      return NextResponse.json({ ...payload, status: "none" });
    }

    if (action === "remove") {
      const targetObjectId = toObjectId(targetUserId);
      if (!targetObjectId) {
        return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
      }
      await Promise.all([
        usersCollection.updateOne(
          { _id: new ObjectId(token.sub) },
          { $pull: { friends: targetUserId } },
        ),
        usersCollection.updateOne(
          { _id: targetObjectId },
          { $pull: { friends: token.sub } },
        ),
      ]);

      const payload = await buildProfilePayload(targetUserId, token.sub, token.role);
      return NextResponse.json({ ...payload, status: "none" });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    await logError("Failed to handle friend action", error, {
      route: "/api/profile/friends",
      method: request?.method,
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to update friends right now." },
      { status: 500 },
    );
  }
}
