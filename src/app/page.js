"use client";

import { useEffect, useState } from "react";

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

export default function Home() {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [form, setForm] = useState({ title: "", message: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const load = async () => {
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

    load();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setPosting(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, message: form.message }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Unable to save update.");
      }

      const newUpdate = data.update;
      setUpdates((prev) => [newUpdate, ...prev]);
      setForm({ title: "", message: "" });
      setNotice("Update posted successfully.");
    } catch (err) {
      setError(err.message || "Unable to save update.");
    } finally {
      setPosting(false);
    }
  };

  const disableSubmit = posting || !form.title.trim() || !form.message.trim();

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
            <span className="text-sm text-slate-300">
              Stay aligned with the latest announcements.
            </span>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30 backdrop-blur">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Latest updates</h2>
              {loading ? (
                <span className="text-xs text-slate-300">Loading…</span>
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
              <button
                type="submit"
                disabled={disableSubmit}
                className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:scale-[1.01] hover:bg-emerald-300 disabled:scale-100 disabled:cursor-not-allowed disabled:bg-emerald-400/50"
              >
                {posting ? "Posting…" : "Post New Update"}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
