"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ParticleBackground from "../particle-background";

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
      backgroundColor: `${color}1A`,
      color,
    };
  }
  return {
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#e5e7eb",
  };
};

export default function ArchivedUpdatesPage() {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadArchivedUpdates = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/archivedupdates", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Unable to load archived updates.");
        }

        setUpdates(data.updates ?? []);
      } catch (err) {
        setError(err.message || "Unable to load archived updates.");
      } finally {
        setLoading(false);
      }
    };

    loadArchivedUpdates();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-16 text-slate-100">
      <ParticleBackground />
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white">Archived Updates</h1>
            <p className="mt-2 text-slate-300">
              Updates older than 24 hours
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-emerald-200/30 bg-emerald-950/50 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:border-emerald-200/60 hover:bg-emerald-900/70"
          >
            Back to Latest
          </Link>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-xl border border-white/5 bg-white/5 px-5 py-4"
              >
                <div className="mb-2 h-3 w-32 rounded bg-white/20" />
                <div className="h-4 w-11/12 rounded bg-white/15" />
              </div>
            ))}
          </div>
        ) : updates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-5 py-10 text-center text-slate-300">
            No archived updates yet.
          </div>
        ) : (
          <div className="space-y-4">
            {updates.map((update) => (
              <article
                key={update._id?.toString?.() || update._id}
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
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {update.happensAt && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 px-3 py-1 text-emerald-100">
                      <span className="h-2 w-2 rounded-full bg-emerald-300" />
                      Happens {formatDate(update.happensAt)}
                    </span>
                  )}
                  {Array.isArray(update.tags) &&
                    update.tags.map((tag) => (
                      <span
                        key={tag.name}
                        style={tagStyle(tag.color)}
                        className="rounded-full border px-2.5 py-1 text-xs font-medium"
                      >
                        {tag.icon} {tag.name}
                      </span>
                    ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
