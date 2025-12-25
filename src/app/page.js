"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const formatDate = (value) => {
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (error) {
    return "Unknown date";
  }
};

const tagStyle = (color) => {
  if (typeof color === "string" && color.startsWith("#") && color.length === 7) {
    return {
      borderColor: color,
      backgroundColor: `${color}1A`, // ~10% opacity
      color,
    };
  }
  return {
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#e5e7eb",
  };
};

export default function Home() {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    message: "",
    happensAtDate: "",
    happensAtTime: "",
    tags: [],
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tags, setTags] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsError, setTagsError] = useState("");

  useEffect(() => {
    const loadUpdates = async () => {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("/api/updates", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Unable to load updates.");
        }

        setUpdates(data.updates ?? []);
      } catch (err) {
        setError(err.message || "Unable to load updates.");
      } finally {
        setLoading(false);
      }
    };

    const loadTags = async () => {
      setTagsLoading(true);
      setTagsError("");

      try {
        const res = await fetch("/api/tags", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Unable to load tags.");
        }

        setTags(data.tags ?? []);
      } catch (err) {
        setTagsError(err.message || "Unable to load tags.");
      } finally {
        setTagsLoading(false);
      }
    };

    loadUpdates();
    loadTags();
  }, []);

  const toggleTag = (tagName) => {
    setForm((f) => {
      const exists = f.tags.includes(tagName);
      const nextTags = exists
        ? f.tags.filter((tag) => tag !== tagName)
        : [...f.tags, tagName];
      return { ...f, tags: nextTags };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setPosting(true);
    setError("");
    setNotice("");

    const happensAt = form.happensAtDate
      ? `${form.happensAtDate}T${form.happensAtTime || "00:00"}`
      : null;

    try {
      const res = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          message: form.message,
          happensAt,
          tags: form.tags,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Unable to save update.");
      }

      const newUpdate = data.update;
      setUpdates((prev) => [newUpdate, ...prev]);
      setForm({
        title: "",
        message: "",
        happensAtDate: "",
        happensAtTime: "",
        tags: [],
      });
      setNotice("Update posted successfully.");
    } catch (err) {
      setError(err.message || "Unable to save update.");
    } finally {
      setPosting(false);
    }
  };

  const disableSubmit =
    posting ||
    !form.title.trim() ||
    !form.message.trim() ||
    tagsLoading ||
    form.tags.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-16">
        <header className="flex flex-col gap-3">
          <p className="text-sm uppercase tracking-[0.28em] text-emerald-300/80">
            InfoPortal
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Updates
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-300">
                Stay aligned with the latest announcements.
              </span>
              <Link href="/documentation" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold text-white/90 hover:bg-white/10">
                Documentation
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30 backdrop-blur">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Latest updates</h2>
              {loading ? (
                <span className="text-xs text-slate-300">Loading...</span>
              ) : (
                <span className="text-xs text-slate-300">
                  {updates.length} {updates.length === 1 ? "item" : "items"}
                </span>
              )}
            </div>
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}
            {!loading && updates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-5 py-10 text-center text-slate-300">
                No updates yet. Be the first to post.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {loading
                  ? Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={index}
                        className="animate-pulse rounded-xl border border-white/5 bg-white/5 px-5 py-4"
                      >
                        <div className="mb-2 h-3 w-32 rounded bg-white/20" />
                        <div className="h-4 w-11/12 rounded bg-white/15" />
                      </div>
                    ))
                  : updates.map((update) => (
                      <article
                        key={update._id?.toString?.() || update._id || update.title}
                        className="rounded-xl border border-white/10 bg-slate-900/70 px-5 py-4 shadow-inner shadow-black/40"
                      >
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <h3 className="text-lg font-semibold text-white">
                            {update.title}
                          </h3>
                          <span className="text-xs text-slate-400">
                            {formatDate(update.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-200">
                          {update.message}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                          {update.happensAt && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 px-3 py-1 text-emerald-100">
                              <span className="h-2 w-2 rounded-full bg-emerald-300" />
                              Happens {formatDate(update.happensAt)}
                            </span>
                          )}
                          {Array.isArray(update.tags) &&
                            update.tags.map((tag) => {
                              const name = tag?.name || tag;
                              const color = tag?.color;
                              const icon = tag?.icon || "🏷️";
                              const style = tagStyle(color);
                              return (
                                <span
                                  key={name}
                                  style={style}
                                  className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-white shadow-inner shadow-black/30"
                                >
                                  <span className="text-base">{icon}</span>
                                  <span className="text-[0.72rem]">{name}</span>
                                </span>
                              );
                            })}
                        </div>
                      </article>
                    ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/40 p-6 shadow-xl shadow-emerald-500/20 backdrop-blur">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-emerald-50">
                  Post new update
                </h2>
                <p className="text-sm text-emerald-50/80">
                  Share news, alerts, or announcements with everyone.
                </p>
              </div>
              {notice && (
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-50">
                  Saved
                </span>
              )}
            </div>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2 text-sm font-medium text-emerald-50/90">
                Title
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Quarterly results are live"
                  className="w-full rounded-lg border border-emerald-200/40 bg-emerald-950/60 px-3 py-2 text-base text-emerald-50 placeholder:text-emerald-50/50 focus:border-emerald-200/70 focus:outline-none focus:ring-2 focus:ring-emerald-300/50"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-emerald-50/90">
                Message
                <textarea
                  rows="4"
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Add more context or links for the team."
                  className="w-full rounded-lg border border-emerald-200/40 bg-emerald-950/60 px-3 py-2 text-base text-emerald-50 placeholder:text-emerald-50/50 focus:border-emerald-200/70 focus:outline-none focus:ring-2 focus:ring-emerald-300/50"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-[1.15fr_0.85fr]">
                <label className="flex flex-col gap-2 text-sm font-medium text-emerald-50/90">
                  Event date (optional)
                  <input
                    type="date"
                    value={form.happensAtDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, happensAtDate: e.target.value }))
                    }
                    className="w-full rounded-lg border border-emerald-200/40 bg-emerald-950/60 px-3 py-2 text-base text-emerald-50 placeholder:text-emerald-50/50 focus:border-emerald-200/70 focus:outline-none focus:ring-2 focus:ring-emerald-300/50"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-emerald-50/90">
                  Event time
                  <input
                    type="time"
                    value={form.happensAtTime}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, happensAtTime: e.target.value }))
                    }
                    className="w-full rounded-lg border border-emerald-200/40 bg-emerald-950/60 px-3 py-2 text-base text-emerald-50 placeholder:text-emerald-50/50 focus:border-emerald-200/70 focus:outline-none focus:ring-2 focus:ring-emerald-300/50"
                  />
                </label>
              </div>
              <div className="flex flex-col gap-2 text-sm font-medium text-emerald-50/90">
                <div className="flex items-center justify-between gap-2">
                  <span>Tags (choose at least one)</span>
                  <span className="text-xs uppercase tracking-[0.16em] text-emerald-100/80">
                    Required
                  </span>
                </div>
                {tagsError && (
                  <div className="rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-xs font-normal text-amber-100">
                    {tagsError}
                  </div>
                )}
                {tagsLoading ? (
                  <div className="space-y-2 rounded-lg border border-emerald-200/20 bg-emerald-950/50 p-3">
                    <div className="h-10 rounded bg-emerald-200/20" />
                    <div className="h-6 rounded bg-emerald-200/10" />
                  </div>
                ) : tags.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200/30 bg-emerald-950/60 px-4 py-3 text-xs font-normal text-emerald-100">
                    No tags yet. Add one on the right to start using tags.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => {
                        const selected = form.tags.includes(tag.name);
                        const style = tagStyle(tag.color);
                        return (
                          <button
                            key={tag._id || tag.name}
                            type="button"
                            onClick={() => toggleTag(tag.name)}
                            style={style}
                            className={`group inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] shadow-inner shadow-black/30 transition hover:-translate-y-[1px] hover:shadow-emerald-500/30 ${selected ? "ring-2 ring-white/60" : ""}`}
                          >
                            <span className="text-sm">{tag.icon || "🏷️"}</span>
                            <span className="text-[0.78rem]">{tag.name}</span>
                            {selected && (
                              <span className="text-[0.7rem] text-white/90">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {form.tags.length === 0 && (
                      <p className="text-xs font-normal text-amber-100">
                        Pick one or more tags to post this update.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={disableSubmit}
                className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:scale-[1.01] hover:bg-emerald-300 disabled:scale-100 disabled:cursor-not-allowed disabled:bg-emerald-400/50"
              >
                {posting ? "Posting..." : "Post New Update"}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
