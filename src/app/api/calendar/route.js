import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getGoogleAccessToken } from "@/lib/google-calendar";

function getMonthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
}

function getWeekRange(date) {
  const dayOfWeek = date.getDay();
  const start = new Date(date);
  start.setDate(date.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function getDayRange(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

function parseDateParam(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export async function GET(request) {
  const token = await getToken({ req: request });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "month";
  const dateParam = searchParams.get("date");
  const timeMinParam = searchParams.get("timeMin");
  const timeMaxParam = searchParams.get("timeMax");
  const baseDate = parseDateParam(dateParam);

  if (!baseDate) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  let range;
  if (timeMinParam && timeMaxParam) {
    const minDate = new Date(timeMinParam);
    const maxDate = new Date(timeMaxParam);
    if (Number.isNaN(minDate.getTime()) || Number.isNaN(maxDate.getTime())) {
      return NextResponse.json({ error: "Invalid time range." }, { status: 400 });
    }
    range = { start: minDate, end: maxDate };
  } else if (view === "week") {
    range = getWeekRange(baseDate);
  } else if (view === "day") {
    range = getDayRange(baseDate);
  } else {
    range = getMonthRange(baseDate);
  }

  const timeMin = range.start.toISOString();
  const timeMax = range.end.toISOString();

  try {
    const accessToken = await getGoogleAccessToken(token.sub);
    const calendarId = "primary";
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId
      )}/events`
    );
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "2500");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Google Calendar API error.", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      items: data.items || [],
      timeMin,
      timeMax,
      view,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load calendar data.", details: error.message },
      { status: 500 }
    );
  }
}
