import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { buildProfilePayload } from "../profile-service";
import { logError } from "@/lib/logger";

export async function GET(request, context) {
  let token;
  const params = await context.params;
  const targetUsername = params?.username;
  if (!targetUsername) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token?.sub) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const payload = await buildProfilePayload(targetUsername, token.sub, token.role);
    if (payload?.error) {
      return NextResponse.json({ error: payload.error }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    await logError("Failed to load profile", error, {
      route: `/api/profile/${targetUsername}`,
      method: request?.method,
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to load profile right now." },
      { status: 500 },
    );
  }
}
