"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import ParticleBackground from "../particle-background";

function SectionCard({ title, items }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-inner shadow-black/30">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {Array.isArray(items) && items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li
              key={`${title}-${index}`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-slate-100"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-300">No items.</p>
      )}
    </section>
  );
}

export default function PersonalHelperPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const generateBriefing = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/personal-helper/briefing", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Unable to generate briefing.");
      }
      setResult(data);
    } catch (err) {
      setError(err.message || "Unable to generate briefing.");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
        <ParticleBackground />
        <main className="relative z-10 mx-auto max-w-5xl px-6 py-14">
          <p className="text-sm text-slate-300">Loading personal helper...</p>
        </main>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
        <ParticleBackground />
        <main className="relative z-10 mx-auto max-w-5xl px-6 py-14">
          <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-6 text-amber-100">
            Sign in to use Personal Helper.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <ParticleBackground />
      <main className="relative z-10 mx-auto flex max-w-5xl flex-col gap-6 px-6 py-14">
        <header className="rounded-2xl border border-cyan-300/20 bg-cyan-900/10 p-6 shadow-xl shadow-black/30 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
            Personal Helper
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-cyan-50">
            Daily executive briefing
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-cyan-50/80">
            Generate a detailed summary of what matters today, your open tasks,
            and risks based on updates, calendar signals, and project instructions.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={generateBriefing}
              disabled={loading}
              className="rounded-full border border-cyan-200/40 bg-cyan-500/15 px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-100/70 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Generating..." : "Generate Briefing"}
            </button>
            <Link
              href="/"
              className="rounded-full border border-white/20 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 transition hover:border-white/40"
            >
              Back to Home
            </Link>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {result && (
          <>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 uppercase tracking-[0.12em] text-slate-200">
                  Source:{" "}
                  {result.source === "ollama"
                    ? "Ollama"
                    : result.source === "fallback"
                      ? "Fallback"
                      : result.source || "Unknown"}
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 uppercase tracking-[0.12em] text-slate-200">
                  Model: {result.model || "n/a"}
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 uppercase tracking-[0.12em] text-slate-200">
                  Open tasks: {result?.signals?.taskCount ?? 0}
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 uppercase tracking-[0.12em] text-slate-200">
                  Feed items: {(result?.signals?.updateCount ?? 0) + (result?.signals?.calendarCount ?? 0)}
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-300">
                Generated{" "}
                {result.generatedAt
                  ? new Date(result.generatedAt).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "just now"}
              </p>
              {result?.briefing?.overallSummary && (
                <p className="mt-3 rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-50">
                  {result.briefing.overallSummary}
                </p>
              )}
              {Array.isArray(result.warnings) && result.warnings.length > 0 && (
                <div className="mt-3 space-y-2">
                  {result.warnings.map((warning, index) => (
                    <p
                      key={`warning-${index}`}
                      className="rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
                    >
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard
                title="What Matters"
                items={result?.briefing?.whatMatters}
              />
              <SectionCard title="My Tasks" items={result?.briefing?.myTasks} />
              <SectionCard title="Risks" items={result?.briefing?.risks} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
