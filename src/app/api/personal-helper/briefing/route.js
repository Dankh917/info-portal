import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { ObjectId } from "mongodb";
import { clientPromise, getProjectsCollection, getUpdatesCollection } from "@/lib/mongo";
import { getGoogleAccessToken } from "@/lib/google-calendar";
import { logError } from "@/lib/logger";

const dbName = process.env.MONGODB_DB || "info-portal";
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434")
  .trim()
  .replace(/\/+$/, "");
const OLLAMA_MODEL_DEFAULT = (process.env.OLLAMA_MODEL || "llama3.2:1b").trim();
const CALENDAR_DEDUPE_WINDOW_MS = 3 * 60 * 60 * 1000;

const GOOGLE_RECONNECT_MESSAGE =
  "Google Calendar needs to be reconnected. Please sign out and sign in again.";

function createAppError(code, message, status = 500) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function isGoogleReconnectError(error) {
  return (
    error?.code === "GOOGLE_REAUTH_REQUIRED" ||
    error?.code === "GOOGLE_ACCOUNT_NOT_FOUND"
  );
}

function normalizeKeyText(value) {
  return (value || "").toString().trim().toLowerCase();
}

function buildCalendarKey(title, dateKey, timeKey) {
  return `${normalizeKeyText(title)}|${dateKey}|${timeKey}`;
}

function buildDateTimeKey(dateKey, timeKey) {
  return `${dateKey}|${timeKey}`;
}

function buildTitleDateKey(title, dateKey) {
  return `${normalizeKeyText(title)}|${dateKey}`;
}

function toLocalDateString(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalTimeString(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function formatDateTime(value) {
  if (!value) return "Unknown time";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (error) {
    return "Unknown time";
  }
}

function formatDateOnly(value) {
  if (!value) return "No due date";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch (error) {
    return "No due date";
  }
}

function stripCalendarMetadata(value) {
  if (!value) return "";
  const lines = value.split(/\r?\n/);
  const kept = lines.filter((line) => {
    const lower = line.trim().toLowerCase();
    return !lower.includes("#tags:") && !lower.includes("#departments:");
  });
  return kept.join("\n").trim();
}

function isPrivateCalendarTitle(title) {
  const normalized = normalizeKeyText(title);
  return normalized === "private event" || normalized === "busy";
}

function parseJsonFromText(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (nestedError) {
        return null;
      }
    }
    return null;
  }
}

function sanitizeSection(sectionValue, fallbackLine) {
  if (!Array.isArray(sectionValue)) {
    return [fallbackLine];
  }
  const normalized = sectionValue
    .map((item) => (typeof item === "string" ? item : ""))
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  return normalized.length > 0 ? normalized : [fallbackLine];
}

function sanitizeSummary(value) {
  if (typeof value !== "string") {
    return "Your briefing is ready. Review what matters, your tasks, and risks for today.";
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Your briefing is ready. Review what matters, your tasks, and risks for today.";
  }
  return normalized.slice(0, 280);
}

function sanitizeBriefing(value) {
  return {
    overallSummary: sanitizeSummary(value?.overallSummary || value?.summary),
    whatMatters: sanitizeSection(
      value?.whatMatters,
      "No major updates were identified for today."
    ),
    myTasks: sanitizeSection(
      value?.myTasks,
      "No open assigned tasks were found."
    ),
    risks: sanitizeSection(
      value?.risks,
      "No significant execution risks were detected."
    ),
  };
}

function isDoneStatus(status) {
  return (status || "").toString().toLowerCase() === "done";
}

function serializeFeedItemsForPrompt(feedItems) {
  return feedItems.slice(0, 24).map((item, index) => {
    const typeLabel = item.type === "calendar" ? "Calendar" : "Update";
    const labels = [];
    if (Array.isArray(item.departments) && item.departments.length > 0) {
      labels.push(`departments=${item.departments.join(", ")}`);
    }
    if (Array.isArray(item.tags) && item.tags.length > 0) {
      labels.push(`tags=${item.tags.join(", ")}`);
    }
    const labelPart = labels.length > 0 ? ` [${labels.join(" | ")}]` : "";
    const message = (item.message || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);
    return `${index + 1}. ${typeLabel} | ${item.title || "Untitled"} | ${formatDateTime(
      item.happensAt || item.createdAt
    )}${labelPart}${message ? ` | ${message}` : ""}`;
  });
}

function serializeTasksForPrompt(tasks) {
  return tasks.slice(0, 40).map((task, index) => {
    const dueLabel = task.projectDueDate
      ? `due=${formatDateOnly(task.projectDueDate)}`
      : "due=not set";
    const deptLabel =
      Array.isArray(task.projectDepartments) && task.projectDepartments.length > 0
        ? `depts=${task.projectDepartments.join(", ")}`
        : "depts=General";
    const statusLabel = `status=${task.projectStatus || "planned"}`;
    return `${index + 1}. [${task.projectTitle}] ${task.text} (${dueLabel}; ${statusLabel}; ${deptLabel})`;
  });
}

function buildPrompt({ nowIso, displayName, feedItems, tasks, signals }) {
  const feedLines = serializeFeedItemsForPrompt(feedItems);
  const taskLines = serializeTasksForPrompt(tasks);

  const promptSections = [
    `You are a concise executive helper creating a personal daily briefing for ${displayName || "the user"}.`,
    `Today timestamp: ${nowIso}`,
    "Use only the supplied internal portal data.",
    "Return strict JSON only with this schema:",
    '{"overallSummary": string, "whatMatters": string[], "myTasks": string[], "risks": string[]}',
    "Rules:",
    "- overallSummary must be 1 to 2 sentences that summarize the day overall.",
    "- Provide 3 to 6 bullets in each array.",
    "- Prioritize urgency, due dates, blocked status, and concrete next actions.",
    "- Reference exact project/update titles when possible.",
    "- Keep each bullet to one sentence.",
    "- If a section has limited data, still provide useful guidance based on available signals.",
    "",
    `Signal summary: updates=${signals.updateCount}, calendarItems=${signals.calendarCount}, openTasks=${signals.taskCount}, blockedAssignedProjects=${signals.blockedAssignedProjects}, overdueAssignedProjects=${signals.overdueAssignedProjects}`,
    "",
    "Updates and calendar items:",
    ...(feedLines.length > 0 ? feedLines : ["(none)"]),
    "",
    "Open assigned tasks:",
    ...(taskLines.length > 0 ? taskLines : ["(none)"]),
  ];

  return promptSections.join("\n");
}

function taskPriority(task, todayStart, weekEnd) {
  const due = task?.projectDueDate ? new Date(task.projectDueDate) : null;
  const hasDue = Boolean(due && !Number.isNaN(due.getTime()));
  const isOverdue = Boolean(hasDue && due < todayStart && !isDoneStatus(task.projectStatus));
  const isDueSoon = Boolean(
    hasDue &&
      due >= todayStart &&
      due < weekEnd &&
      !isDoneStatus(task.projectStatus)
  );
  const isBlocked = (task?.projectStatus || "").toLowerCase() === "blocked";
  const isUpdatedRecently = task?.updatedAt
    ? Date.now() - new Date(task.updatedAt).getTime() < 2 * 24 * 60 * 60 * 1000
    : false;

  if (isOverdue) return 100;
  if (isBlocked && isDueSoon) return 90;
  if (isDueSoon) return 80;
  if (isBlocked) return 70;
  if (isUpdatedRecently) return 60;
  return 50;
}

function buildFallbackBriefing({ feedItems, tasks, signals }) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const prioritizedTasks = [...tasks].sort((a, b) => {
    const aScore = taskPriority(a, todayStart, weekEnd);
    const bScore = taskPriority(b, todayStart, weekEnd);
    if (aScore !== bScore) return bScore - aScore;

    const aDue = a.projectDueDate
      ? new Date(a.projectDueDate).getTime()
      : Number.POSITIVE_INFINITY;
    const bDue = b.projectDueDate
      ? new Date(b.projectDueDate).getTime()
      : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });

  const whatMatters = [];
  whatMatters.push(
    `${signals.updateCount} updates and ${signals.calendarCount} calendar items are in today's briefing window.`
  );
  feedItems.slice(0, 4).forEach((item) => {
    const label = item.type === "calendar" ? "Calendar" : "Update";
    whatMatters.push(
      `${label}: ${item.title || "Untitled"} at ${formatDateTime(
        item.happensAt || item.createdAt
      )}.`
    );
  });
  if (feedItems.length === 0) {
    whatMatters.push("No update or calendar signal was found in the current window.");
  }

  const myTasks = [];
  if (prioritizedTasks.length === 0) {
    myTasks.push("No open assigned instructions are currently pending.");
  } else {
    prioritizedTasks.slice(0, 8).forEach((task) => {
      const dueLabel = task.projectDueDate
        ? `Due ${formatDateOnly(task.projectDueDate)}`
        : "No due date";
      myTasks.push(`[${task.projectTitle}] ${task.text} (${dueLabel}).`);
    });
  }

  const risks = [];
  if (signals.overdueAssignedProjects > 0) {
    risks.push(
      `${signals.overdueAssignedProjects} assigned project${
        signals.overdueAssignedProjects === 1 ? "" : "s"
      } are overdue.`
    );
  }
  if (signals.blockedAssignedProjects > 0) {
    risks.push(
      `${signals.blockedAssignedProjects} assigned project${
        signals.blockedAssignedProjects === 1 ? "" : "s"
      } are blocked and may prevent task completion.`
    );
  }
  if (prioritizedTasks.length >= 10) {
    risks.push("Task load is high; triage the top due and blocked items first.");
  }
  if (risks.length === 0) {
    risks.push("No critical personal execution risks were detected from current signals.");
  }

  let overallSummary =
    `You have ${signals.taskCount} open task${
      signals.taskCount === 1 ? "" : "s"
    } and ${signals.updateCount + signals.calendarCount} feed signal${
      signals.updateCount + signals.calendarCount === 1 ? "" : "s"
    } to review today.`;
  if (signals.overdueAssignedProjects > 0 || signals.blockedAssignedProjects > 0) {
    overallSummary +=
      ` Prioritize overdue and blocked work first to reduce execution risk.`;
  } else {
    overallSummary += ` No critical personal risks were detected from current signals.`;
  }

  return {
    overallSummary: sanitizeSummary(overallSummary),
    whatMatters: whatMatters.slice(0, 6),
    myTasks: myTasks.slice(0, 8),
    risks: risks.slice(0, 6),
  };
}

async function getUserDepartments(token) {
  let dbDepartments = [];
  try {
    const client = await clientPromise;
    const usersCollection = client.db(dbName).collection("users");
    const hasObjectId = token.sub && ObjectId.isValid(token.sub);
    const userQuery = hasObjectId ? { _id: new ObjectId(token.sub) } : { email: token.email };
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
  } catch (error) {
    await logError("Failed to load user departments for personal helper", error, {
      route: "/api/personal-helper/briefing",
      userId: token?.sub,
    });
  }

  return dbDepartments.length
    ? dbDepartments
    : Array.isArray(token.departments)
      ? token.departments
      : token.department
        ? [token.department]
        : [];
}

async function loadUpdates(token, userDepartments) {
  const collection = await getUpdatesCollection();
  const filters = [{ departments: { $in: ["General"] } }, { authorId: token.sub }];
  if (userDepartments.length > 0) {
    filters.push({ departments: { $in: userDepartments } });
  }

  const updates = await collection
    .find({
      $or: filters,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    })
    .sort({ createdAt: -1 })
    .limit(120)
    .toArray();

  return updates.map((update) => ({
    id: update._id?.toString?.() || update._id || "",
    type: "update",
    title: update.title || "Untitled update",
    message: update.message || "",
    createdAt: update.createdAt || null,
    happensAt: update.happensAt || null,
    departments: Array.isArray(update.departments) ? update.departments : [],
    tags: Array.isArray(update.tags)
      ? update.tags
          .map((tag) => (typeof tag === "string" ? tag : tag?.name))
          .filter(Boolean)
      : [],
    source: update.source || "",
  }));
}

async function loadCalendarItems(userId) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);

  try {
    const accessToken = await getGoogleAccessToken(userId);
    const url = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    );
    url.searchParams.set("timeMin", start.toISOString());
    url.searchParams.set("timeMax", end.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "2500");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          items: [],
          warning: GOOGLE_RECONNECT_MESSAGE,
        };
      }
      const errorText = await response.text();
      throw createAppError(
        "CALENDAR_FETCH_FAILED",
        `Google Calendar request failed: ${response.status} ${errorText}`,
        response.status
      );
    }

    const payload = await response.json();
    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    const todayKey = toLocalDateString(new Date());

    const normalized = rawItems
      .map((event) => {
        const startValue = event?.start?.date || event?.start?.dateTime;
        if (!startValue) return null;
        const isAllDay = Boolean(event?.start?.date);
        const eventDateKey =
          event?.start?.date || toLocalDateString(event?.start?.dateTime);
        if (!eventDateKey || eventDateKey < todayKey) return null;

        const title = event?.summary || "Untitled event";
        const timeKey = isAllDay ? "" : toLocalTimeString(event?.start?.dateTime);
        const startMs = isAllDay
          ? new Date(`${eventDateKey}T00:00:00`).getTime()
          : new Date(event?.start?.dateTime).getTime();

        return {
          id: `calendar-${event?.id || buildCalendarKey(title, eventDateKey, timeKey)}`,
          type: "calendar",
          title,
          message: stripCalendarMetadata(event?.description || ""),
          createdAt: event?.start?.dateTime || event?.start?.date || null,
          happensAt: event?.start?.dateTime || event?.start?.date || null,
          departments: [],
          tags: [],
          source: "calendar-local",
          eventKey: buildCalendarKey(title, eventDateKey, timeKey),
          dateTimeKey: buildDateTimeKey(eventDateKey, timeKey),
          dateOnlyKey: buildDateTimeKey(eventDateKey, ""),
          titleDateKey: buildTitleDateKey(title, eventDateKey),
          isPrivateEvent: isPrivateCalendarTitle(title),
          isAllDay,
          dateKey: eventDateKey,
          startMs,
        };
      })
      .filter(Boolean);

    return {
      items: normalized,
      warning: "",
    };
  } catch (error) {
    if (isGoogleReconnectError(error)) {
      return {
        items: [],
        warning: GOOGLE_RECONNECT_MESSAGE,
      };
    }
    throw error;
  }
}

function dedupeCalendarItems(updates, calendarItems) {
  const fullKeys = new Set();
  const dateTimeKeys = new Set();
  const dateOnlyKeys = new Set();
  const titleDateKeys = new Set();
  const titleTimeIndex = new Map();

  updates.forEach((update) => {
    if (!update?.happensAt) return;
    const title = update.title || "";
    const dateKey = toLocalDateString(update.happensAt);
    if (!dateKey) return;
    const timeKey = toLocalTimeString(update.happensAt);
    fullKeys.add(buildCalendarKey(title, dateKey, timeKey));
    dateTimeKeys.add(buildDateTimeKey(dateKey, timeKey));
    if (timeKey === "00:00") {
      dateOnlyKeys.add(buildDateTimeKey(dateKey, ""));
    }
    titleDateKeys.add(buildTitleDateKey(title, dateKey));
    const titleKey = normalizeKeyText(title);
    const updateMs = new Date(update.happensAt).getTime();
    if (!Number.isNaN(updateMs)) {
      const entries = titleTimeIndex.get(titleKey) || [];
      entries.push({ ms: updateMs, dateKey });
      titleTimeIndex.set(titleKey, entries);
    }
  });

  return calendarItems.filter((item) => {
    if (fullKeys.has(item.eventKey)) {
      return false;
    }

    const titleKey = normalizeKeyText(item.title);
    const titleEntries = titleTimeIndex.get(titleKey);
    if (titleEntries && Number.isFinite(item.startMs)) {
      const hasCloseMatch = titleEntries.some(
        (entry) =>
          entry.dateKey === item.dateKey &&
          Math.abs(entry.ms - item.startMs) <= CALENDAR_DEDUPE_WINDOW_MS
      );
      if (hasCloseMatch) {
        return false;
      }
    }

    if (item.isAllDay && titleDateKeys.has(item.titleDateKey)) {
      return false;
    }
    if (item.isPrivateEvent) {
      if (dateTimeKeys.has(item.dateTimeKey)) {
        return false;
      }
      if (item.isAllDay && dateOnlyKeys.has(item.dateOnlyKey)) {
        return false;
      }
    }
    return true;
  });
}

async function loadOpenAssignedTasks(userId) {
  const projectsCollection = await getProjectsCollection();
  const projects = await projectsCollection
    .find({ "assignments.userId": userId })
    .project({
      title: 1,
      status: 1,
      dueDate: 1,
      departments: 1,
      updatedAt: 1,
      createdAt: 1,
      assignments: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(200)
    .toArray();

  const tasks = [];
  let blockedAssignedProjects = 0;
  let overdueAssignedProjects = 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  projects.forEach((project) => {
    const status = (project?.status || "planned").toLowerCase();
    if (status === "blocked") {
      blockedAssignedProjects += 1;
    }
    const dueDate = project?.dueDate ? new Date(project.dueDate) : null;
    if (
      dueDate &&
      !Number.isNaN(dueDate.getTime()) &&
      dueDate < todayStart &&
      status !== "done"
    ) {
      overdueAssignedProjects += 1;
    }

    const assignment = Array.isArray(project.assignments)
      ? project.assignments.find(
          (item) => item?.userId?.toString?.() === userId?.toString?.()
        )
      : null;
    if (!assignment) return;
    const instructions = Array.isArray(assignment.instructions)
      ? assignment.instructions
      : [];
    instructions.forEach((instruction) => {
      if (instruction?.done === true) return;
      const text = instruction?.text?.toString?.().trim();
      if (!text) return;
      tasks.push({
        projectId: project._id?.toString?.() || "",
        projectTitle: project?.title || "Untitled project",
        projectStatus: status,
        projectDueDate: project?.dueDate || null,
        projectDepartments: Array.isArray(project?.departments)
          ? project.departments
          : [],
        instructionId: instruction?._id?.toString?.() || "",
        text,
        updatedAt:
          instruction?.updatedAt ||
          project?.updatedAt ||
          project?.createdAt ||
          null,
      });
    });
  });

  return {
    tasks,
    blockedAssignedProjects,
    overdueAssignedProjects,
  };
}

async function generateOllamaBriefing({ prompt }) {
  if (!OLLAMA_MODEL_DEFAULT) {
    throw createAppError(
      "OLLAMA_MODEL_MISSING",
      "OLLAMA_MODEL is missing.",
      500
    );
  }
  if (!OLLAMA_BASE_URL) {
    throw createAppError(
      "OLLAMA_BASE_URL_MISSING",
      "OLLAMA_BASE_URL is missing.",
      500
    );
  }

  const endpoint = `${OLLAMA_BASE_URL}/api/generate`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL_DEFAULT,
      prompt,
      stream: false,
      format: "json",
      options: {
        temperature: 0.2,
        num_predict: 1200,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createAppError(
      "OLLAMA_REQUEST_FAILED",
      payload?.error || `Ollama request failed with status ${response.status}.`,
      response.status
    );
  }
  if (payload?.error) {
    throw createAppError("OLLAMA_MODEL_ERROR", payload.error, 502);
  }

  const text = typeof payload?.response === "string" ? payload.response.trim() : "";
  const parsed = parseJsonFromText(text);
  if (!parsed) {
    throw createAppError(
      "OLLAMA_INVALID_RESPONSE",
      "Ollama returned an invalid JSON payload.",
      500
    );
  }

  return {
    model: OLLAMA_MODEL_DEFAULT,
    briefing: sanitizeBriefing(parsed),
  };
}

export async function POST(request) {
  let token;
  const warnings = [];

  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token?.sub) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const userDepartments = await getUserDepartments(token);
    const updates = await loadUpdates(token, userDepartments);
    let calendarData = { items: [], warning: "" };
    try {
      calendarData = await loadCalendarItems(token.sub);
      if (calendarData.warning) {
        warnings.push(calendarData.warning);
      }
    } catch (calendarError) {
      warnings.push(
        "Calendar signals are temporarily unavailable. Briefing used updates and tasks only."
      );
      await logError("Failed to load calendar signals for personal helper", calendarError, {
        route: "/api/personal-helper/briefing",
        userId: token?.sub,
      });
    }

    const dedupedCalendar = dedupeCalendarItems(updates, calendarData.items);
    const combinedFeedItems = [...updates, ...dedupedCalendar].sort((a, b) => {
      const aTime = new Date(a.happensAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.happensAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    const taskData = await loadOpenAssignedTasks(token.sub);
    const signals = {
      updateCount: updates.length,
      calendarCount: dedupedCalendar.length,
      taskCount: taskData.tasks.length,
      blockedAssignedProjects: taskData.blockedAssignedProjects,
      overdueAssignedProjects: taskData.overdueAssignedProjects,
    };

    const prompt = buildPrompt({
      nowIso: new Date().toISOString(),
      displayName: token.name || token.email || "User",
      feedItems: combinedFeedItems,
      tasks: taskData.tasks,
      signals,
    });

    let source = "ollama";
    let model = OLLAMA_MODEL_DEFAULT;
    let briefing;
    try {
      const generated = await generateOllamaBriefing({ prompt });
      model = generated.model;
      briefing = generated.briefing;
    } catch (generationError) {
      source = "fallback";
      warnings.push(
        `Ollama briefing unavailable (${generationError.message || "unknown error"}). Local fallback was used.`
      );
      briefing = buildFallbackBriefing({
        feedItems: combinedFeedItems,
        tasks: taskData.tasks,
        signals,
      });
      await logError("Ollama briefing generation failed; using fallback", generationError, {
        route: "/api/personal-helper/briefing",
        userId: token?.sub,
      });
    }

    return NextResponse.json({
      source,
      model,
      generatedAt: new Date().toISOString(),
      briefing,
      signals,
      warnings,
    });
  } catch (error) {
    await logError("Failed to generate personal helper briefing", error, {
      route: "/api/personal-helper/briefing",
      method: request?.method,
      url: request?.url,
      userId: token?.sub,
    });
    return NextResponse.json(
      { error: "Unable to generate briefing right now." },
      { status: error?.status || 500 }
    );
  }
}

