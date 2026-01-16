import { ObjectId } from "mongodb";
import { clientPromise } from "@/lib/mongo";

const dbName = process.env.MONGODB_DB || "info-portal";

function getUserObjectId(userId) {
  if (!userId) return null;
  if (ObjectId.isValid(userId)) {
    return new ObjectId(userId);
  }
  return null;
}

async function getGoogleAccount(userId) {
  const client = await clientPromise;
  const db = client.db(dbName);
  const userObjectId = getUserObjectId(userId);
  const query = {
    provider: "google",
  };

  if (userObjectId) {
    query.userId = userObjectId;
  } else {
    query.userId = userId;
  }

  return db.collection("accounts").findOne(query);
}

async function refreshGoogleAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Google token: ${errorText}`);
  }

  return response.json();
}

export async function getGoogleAccessToken(userId) {
  const account = await getGoogleAccount(userId);
  if (!account) {
    throw new Error("No Google account found for user.");
  }

  const expiresAtMs = account.expires_at ? account.expires_at * 1000 : 0;
  const isTokenValid = account.access_token && Date.now() < expiresAtMs - 60_000;

  if (isTokenValid) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error("Google refresh token is missing.");
  }

  const refreshed = await refreshGoogleAccessToken(account.refresh_token);
  const newExpiresAt = Math.floor(Date.now() / 1000) + (refreshed.expires_in || 0);

  const client = await clientPromise;
  const db = client.db(dbName);
  await db.collection("accounts").updateOne(
    { _id: account._id },
    {
      $set: {
        access_token: refreshed.access_token,
        expires_at: newExpiresAt,
      },
    }
  );

  return refreshed.access_token;
}
