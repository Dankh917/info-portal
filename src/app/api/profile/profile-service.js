import { ObjectId } from "mongodb";
import { clientPromise, getProjectsCollection } from "@/lib/mongo";

const dbName = process.env.MONGODB_DB || "info-portal";
const friendProjection = {
  _id: 1,
  name: 1,
  email: 1,
  image: 1,
  profileImage: 1,
  username: 1,
};

const userProjection = {
  _id: 1,
  name: 1,
  email: 1,
  image: 1,
  profileImage: 1,
  username: 1,
  normalizedUsername: 1,
  bio: 1,
  role: 1,
  departments: 1,
  friends: 1,
  incomingFriendRequests: 1,
  outgoingFriendRequests: 1,
};

const toObjectId = (value) => {
  try {
    return new ObjectId(value);
  } catch (error) {
    return null;
  }
};

const toStringIds = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") return item;
      if (item?.toString) return item.toString();
      return null;
    })
    .filter(Boolean);
};

const loadUsersByIds = async (ids = []) => {
  const objectIds = ids
    .map((id) => toObjectId(id))
    .filter(Boolean);
  if (objectIds.length === 0) return [];
  const client = await clientPromise;
  const usersCollection = client.db(dbName).collection("users");
  const records = await usersCollection
    .find({ _id: { $in: objectIds } })
    .project(friendProjection)
    .toArray();
  return records.map((u) => ({
    id: u._id.toString(),
    name: u.name || u.email || "User",
    email: u.email || "",
    image: u.profileImage || u.image || "",
    username: u.username || u.normalizedUsername || u.email || u._id.toString(),
  }));
};

const slugify = (value) =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "user";

async function ensureUsername(usersCollection, user) {
  if (user.username) return user.username;
  const base = slugify(user.name || user.email || "user");
  const existing = await usersCollection.findOne(
    { normalizedUsername: base },
    { projection: { _id: 1 } },
  );
  const username = existing && existing._id?.equals?.(user._id)
    ? base
    : `${base}-${user._id.toString().slice(-4)}`;

  await usersCollection.updateOne(
    { _id: user._id },
    { $set: { username, normalizedUsername: username.toLowerCase() } },
  );
  return username;
}

const determineFriendStatus = (target, viewerId) => {
  if (!viewerId) return "none";
  const selfId = target._id?.toString?.();
  if (selfId === viewerId) return "self";

  const friends = new Set(toStringIds(target.friends));
  if (friends.has(viewerId)) return "friends";

  const incoming = new Set(toStringIds(target.incomingFriendRequests));
  if (incoming.has(viewerId)) return "outgoing"; // viewer already sent request

  const outgoing = new Set(toStringIds(target.outgoingFriendRequests));
  if (outgoing.has(viewerId)) return "incoming"; // target sent to viewer

  return "none";
};

const loadAssignedProjects = async (targetUserId) => {
  const projectsCollection = await getProjectsCollection();
  const projects = await projectsCollection
    .find({ "assignments.userId": targetUserId })
    .project({
      title: 1,
      status: 1,
      departments: 1,
      dueDate: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(40)
    .toArray();

  return projects.map((p) => ({
    id: p._id?.toString?.() || "",
    title: p.title || "Untitled project",
    status: p.status || "planned",
    departments: Array.isArray(p.departments) ? p.departments : [],
    dueDate: p.dueDate || null,
  }));
};

export async function buildProfilePayload(targetKey, viewerId, viewerRole) {
  const client = await clientPromise;
  const usersCollection = client.db(dbName).collection("users");
  const targetValue = targetKey?.toString?.() || "";
  const maybeId = toObjectId(targetValue);
  const lower = targetValue.toLowerCase();
  const query = maybeId
    ? { $or: [{ _id: maybeId }, { normalizedUsername: lower }, { username: targetValue }] }
    : { $or: [{ normalizedUsername: lower }, { username: targetValue }] };

  const target = await usersCollection.findOne(query, {
    projection: userProjection,
  });

  if (!target) {
    return { error: "User not found." };
  }

  const username = target.username || (await ensureUsername(usersCollection, target));

  const normalized = {
    id: target._id.toString(),
    name: target.name || target.email || "User",
    email: target.email || "",
    image: target.profileImage || target.image || "",
    username,
    bio: target.bio || "",
    role: target.role || "general",
    departments: Array.isArray(target.departments) ? target.departments : [],
  };

  const isSelf = normalized.id === viewerId;
  const friendStatus = determineFriendStatus(target, viewerId);

  const friendIds = toStringIds(target.friends).slice(0, 12);
  const [friends, incoming, outgoing] = await Promise.all([
    loadUsersByIds(friendIds),
    isSelf ? loadUsersByIds(toStringIds(target.incomingFriendRequests)) : Promise.resolve([]),
    isSelf ? loadUsersByIds(toStringIds(target.outgoingFriendRequests)) : Promise.resolve([]),
  ]);

  const includeProjects = isSelf || viewerRole === "admin" || viewerRole === "pm";
  const assignedProjects = includeProjects
    ? await loadAssignedProjects(normalized.id)
    : [];

  return {
    profile: {
      ...normalized,
      isSelf,
      friendStatus,
      friends,
      incomingRequests: isSelf ? incoming : [],
      outgoingRequests: isSelf ? outgoing : [],
      assignedProjects,
    },
  };
}

export function isViewerElevated(viewerRole) {
  return viewerRole === "admin" || viewerRole === "pm";
}
