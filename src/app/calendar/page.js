"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import ParticleBackground from "../particle-background";
import styles from "./calendar.module.css";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS_START = 8;
const HOURS_END = 22;
const HOUR_HEIGHT = 64;

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthLabel(date) {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function getMonthGrid(date) {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  return days;
}

function getWeekDays(date) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  start.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  return days;
}

function getEventDateKey(event) {
  if (!event?.start) return null;
  if (event.start.date) {
    return event.start.date;
  }
  if (event.start.dateTime) {
    return formatDateKey(new Date(event.start.dateTime));
  }
  return null;
}

function getTimeLabel(date) {
  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getEventTimeLabel(event) {
  if (event?.start?.date) {
    return "All day";
  }
  if (event?.start?.dateTime && event?.end?.dateTime) {
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    return `${getTimeLabel(start)} - ${getTimeLabel(end)}`;
  }
  return "";
}

function getEventDescription(event) {
  return event?.description || "";
}

function getEventLocation(event) {
  return event?.location || "";
}

function getEventLink(event) {
  return event?.htmlLink || "";
}

function getWeekEventsLayout(events) {
  const normalized = events
    .map((event) => {
      const isAllDay = Boolean(event?.start?.date);
      const startDate = isAllDay
        ? new Date(`${event.start.date}T00:00:00`)
        : new Date(event.start.dateTime);
      const endDate = isAllDay
        ? new Date(`${event.start.date}T23:59:59`)
        : new Date(event.end.dateTime);

      let startMin = startDate.getHours() * 60 + startDate.getMinutes();
      let endMin = endDate.getHours() * 60 + endDate.getMinutes();

      if (isAllDay) {
        startMin = HOURS_START * 60;
        endMin = Math.min((HOURS_START + 1) * 60, HOURS_END * 60);
      }

      const rangeStart = HOURS_START * 60;
      const rangeEnd = HOURS_END * 60;
      if (endMin <= rangeStart || startMin >= rangeEnd) {
        return null;
      }

      startMin = Math.max(startMin, rangeStart);
      endMin = Math.min(endMin, rangeEnd);

      return {
        event,
        isAllDay,
        startMin,
        endMin,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  let active = [];
  normalized.forEach((item) => {
    active = active.filter((activeItem) => activeItem.endMin > item.startMin);

    const usedLanes = new Set(active.map((entry) => entry.lane));
    let lane = 0;
    while (usedLanes.has(lane)) {
      lane += 1;
    }

    item.lane = lane;
    active = [...active, item];
  });

  normalized.forEach((item) => {
    let laneCount = 1;
    normalized.forEach((other) => {
      const overlaps =
        item.startMin < other.endMin && item.endMin > other.startMin;
      if (overlaps) {
        laneCount = Math.max(laneCount, other.lane + 1);
      }
    });
    item.laneCount = laneCount;
  });

  return normalized;
}

export default function CalendarPage() {
  const { data: session, status } = useSession();
  const [view, setView] = useState("month");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const fetchCalendar = async () => {
      setIsLoading(true);
      setError("");
      try {
        const dateParam = formatDateKey(currentDate);
        const response = await fetch(
          `/api/calendar?view=${view}&date=${dateParam}`
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load calendar.");
        }
        const data = await response.json();
        setEvents(data.items || []);
      } catch (err) {
        setError(err.message || "Failed to load calendar.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCalendar();
  }, [currentDate, status, view]);

  const eventsByDate = useMemo(() => {
    const map = new Map();
    events.forEach((event) => {
      const key = getEventDateKey(event);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(event);
    });
    return map;
  }, [events]);

  const monthDays = useMemo(() => getMonthGrid(currentDate), [currentDate]);
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const hours = useMemo(
    () =>
      Array.from({ length: HOURS_END - HOURS_START }, (_, i) => HOURS_START + i),
    []
  );

  const handlePrevious = () => {
    const next = new Date(currentDate);
    if (view === "week") {
      next.setDate(next.getDate() - 7);
    } else {
      next.setMonth(next.getMonth() - 1);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (view === "week") {
      next.setDate(next.getDate() + 7);
    } else {
      next.setMonth(next.getMonth() + 1);
    }
    setCurrentDate(next);
  };

  if (status === "loading") {
    return <div className={styles.shell}>Loading calendar…</div>;
  }

  if (status !== "authenticated") {
    return (
      <div className={styles.shell}>
        <h1 className={styles.title}>Calendar</h1>
        <p className={styles.message}>Sign in to view your Google Calendar.</p>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <ParticleBackground />
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Google Calendar</p>
          <h1 className={styles.title}>{getMonthLabel(currentDate)}</h1>
        </div>
        <div className={styles.actions}>
          <button className={styles.actionButton} onClick={handlePrevious}>
            Prev
          </button>
          <button
            className={styles.actionButton}
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </button>
          <button className={styles.actionButton} onClick={handleNext}>
            Next
          </button>
        </div>
      </header>

      <div className={styles.viewToggle}>
        <button
          className={`${styles.toggleButton} ${
            view === "month" ? styles.toggleActive : ""
          }`}
          onClick={() => setView("month")}
        >
          Month
        </button>
        <button
          className={`${styles.toggleButton} ${
            view === "week" ? styles.toggleActive : ""
          }`}
          onClick={() => setView("week")}
        >
          Week
        </button>
      </div>

      {isLoading && <p className={styles.message}>Loading events…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {view === "month" ? (
        <div className={styles.grid}>
          {weekdayLabels.map((label) => (
            <div key={label} className={styles.weekday}>
              {label}
            </div>
          ))}
          {monthDays.map((day) => {
            const dayKey = formatDateKey(day);
            const dayEvents = eventsByDate.get(dayKey) || [];
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            return (
              <div
                key={dayKey}
                className={`${styles.dayCell} ${
                  isCurrentMonth ? "" : styles.dayOutside
                }`}
              >
                <div className={styles.dayNumber}>{day.getDate()}</div>
                <ul className={styles.eventList}>
                  {dayEvents.slice(0, 3).map((event) => (
                    <li key={event.id} className={styles.eventItem}>
                      <span className={styles.eventTitle}>
                        {event.summary || "Untitled event"}
                      </span>
                      <span className={styles.tooltip}>
                        <strong>{event.summary || "Untitled event"}</strong>
                        <span>{getEventTimeLabel(event)}</span>
                        {getEventLocation(event) && (
                          <span>Location: {getEventLocation(event)}</span>
                        )}
                        {getEventDescription(event) && (
                          <span>{getEventDescription(event)}</span>
                        )}
                        {getEventLink(event) && (
                          <span>
                            <a href={getEventLink(event)} target="_blank" rel="noreferrer">
                              Open in Google Calendar
                            </a>
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                  {dayEvents.length > 3 && (
                    <li className={styles.moreEvents}>
                      +{dayEvents.length - 3} more
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.weekWrapper}>
          <div className={styles.weekHeader}>
            <div className={styles.timeHeader} />
            {weekDays.map((day) => (
              <div key={formatDateKey(day)} className={styles.weekdayHeader}>
                <span>{weekdayLabels[day.getDay()]}</span>
                <strong>{day.getDate()}</strong>
              </div>
            ))}
          </div>
          <div className={styles.weekBody}>
            <div className={styles.timeColumn}>
              {hours.map((hour) => (
                <div key={hour} className={styles.timeSlot}>
                  {hour.toString().padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {weekDays.map((day) => {
              const dayKey = formatDateKey(day);
              const dayEvents = eventsByDate.get(dayKey) || [];
              const layoutEvents = getWeekEventsLayout(dayEvents);
              const now = new Date();
              const isToday = formatDateKey(now) === dayKey;
              const currentMin = now.getHours() * 60 + now.getMinutes();
              const showNowLine =
                isToday &&
                currentMin >= HOURS_START * 60 &&
                currentMin <= HOURS_END * 60;
              const nowOffset =
                ((currentMin - HOURS_START * 60) / 60) * HOUR_HEIGHT;

              return (
                <div
                  key={dayKey}
                  className={styles.dayColumn}
                  style={{ height: `${hours.length * HOUR_HEIGHT}px` }}
                >
                  {hours.map((hour) => (
                    <div key={`${dayKey}-${hour}`} className={styles.hourBlock} />
                  ))}
                  {showNowLine && (
                    <div
                      className={styles.nowLine}
                      style={{ top: `${nowOffset}px` }}
                    >
                      <span className={styles.nowDot} />
                    </div>
                  )}
                  {layoutEvents.map((item) => {
                    const duration = Math.max(item.endMin - item.startMin, 15);
                    const top =
                      ((item.startMin - HOURS_START * 60) / 60) * HOUR_HEIGHT;
                    const height = (duration / 60) * HOUR_HEIGHT;
                    const width = 100 / item.laneCount;
                    const left = item.lane * width;
                    return (
                      <div
                        key={item.event.id}
                        className={styles.weekEvent}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          width: `${width}%`,
                          left: `${left}%`,
                        }}
                      >
                        <span className={styles.eventTitle}>
                          {item.event.summary || "Untitled event"}
                        </span>
                        <span className={styles.eventTime}>
                          {getEventTimeLabel(item.event)}
                        </span>
                        <span className={styles.tooltip}>
                          <strong>{item.event.summary || "Untitled event"}</strong>
                          <span>{getEventTimeLabel(item.event)}</span>
                          {getEventLocation(item.event) && (
                            <span>Location: {getEventLocation(item.event)}</span>
                          )}
                          {getEventDescription(item.event) && (
                            <span>{getEventDescription(item.event)}</span>
                          )}
                          {getEventLink(item.event) && (
                            <span>
                              <a
                                href={getEventLink(item.event)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open in Google Calendar
                              </a>
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
