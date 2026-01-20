import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getGoogleAccessToken } from "@/lib/google-calendar";

function normalizeLabelList(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => (typeof item === "string" ? item : item?.name))
    .map((item) => (item || "").toString().trim())
    .filter(Boolean);
}

function buildEventDescription(message, tags, departments) {
  const parts = [];
  if (message) {
    parts.push(message.trim());
  }

  const tagLine = tags.length ? `#tags: ${tags.join(", ")}` : "";
  const deptLine = departments.length ? `#departments: ${departments.join(", ")}` : "";

  if (tagLine || deptLine) {
    if (parts.length) parts.push("");
    if (tagLine) parts.push(tagLine);
    if (deptLine) parts.push(deptLine);
  }

  return parts.join("\n").trim();
}

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

export async function POST(request) {
  const token = await getToken({ req: request });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = body?.title?.trim();
  const message = body?.message?.trim();
  const happensAt = body?.happensAt;

  if (!title || !message || !happensAt) {
    return NextResponse.json(
      { error: "Title, message, and date are required." },
      { status: 400 }
    );
  }

  const start = new Date(happensAt);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: "Invalid event date." }, { status: 400 });
  }

  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const tags = normalizeLabelList(body?.tags);
  const departments = normalizeLabelList(body?.departments);
  const description = buildEventDescription(message, tags, departments);

  try {
    const accessToken = await getGoogleAccessToken(token.sub);
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: title,
          description,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Google Calendar API error.", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(
      { event: { id: data.id, htmlLink: data.htmlLink } },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create calendar event.", details: error.message },
      { status: 500 }
    );
  }
}
