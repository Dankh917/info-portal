"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import styles from "./calendar.module.css";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

      <div className={styles.grid}>
        {weekdayLabels.map((label) => (
          <div key={label} className={styles.weekday}>
            {label}
          </div>
        ))}
        {(view === "month" ? monthDays : weekDays).map((day) => {
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
                    {event.summary || "Untitled event"}
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
    </div>
  );
}
