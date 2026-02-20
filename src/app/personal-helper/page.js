"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ParticleBackground from "../particle-background";

const DEFAULT_SUGGESTED_QUERIES = [
  "What deadlines are at risk this week?",
  "What changed in the last 24 hours?",
  "Which projects are blocked right now?",
  "Which recent documents should I review first?",
];

function toSafeTitle(value) {
  return (value || "")
    .toString()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}

function toUpcomingDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function buildSuggestedQueries({ projects, updates, documents }) {
  const suggestions = [];
  const normalizedProjects = Array.isArray(projects) ? projects : [];
  const normalizedUpdates = Array.isArray(updates) ? updates : [];
  const normalizedDocuments = Array.isArray(documents) ? documents : [];

  const blockedProject = normalizedProjects.find(
    (project) => (project?.status || "").toString().toLowerCase() === "blocked"
  );
  if (blockedProject?.title) {
    suggestions.push(`What is blocking "${toSafeTitle(blockedProject.title)}" right now?`);
  }

  const now = Date.now();
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
  const dueSoonProject = normalizedProjects
    .map((project) => ({
      project,
      dueDate: toUpcomingDate(project?.dueDate),
    }))
    .filter((item) => item.dueDate && item.dueDate.getTime() >= now && item.dueDate.getTime() <= weekAhead)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]?.project;

  if (dueSoonProject?.title) {
    suggestions.push(
      `What should I prioritize this week for "${toSafeTitle(dueSoonProject.title)}"?`
    );
  }

  const projectForSummary = normalizedProjects.find((project) => project?.title);
  if (projectForSummary?.title) {
    suggestions.push(
      `Give me a quick status summary for "${toSafeTitle(projectForSummary.title)}".`
    );
  }

  const updateDepartment = normalizedUpdates
    .flatMap((update) =>
      Array.isArray(update?.departments) ? update.departments.filter(Boolean) : []
    )
    .find(Boolean);
  if (updateDepartment) {
    suggestions.push(`What are the latest updates from ${toSafeTitle(updateDepartment)}?`);
  }

  if (normalizedDocuments.length > 0) {
    suggestions.push("Which recent documents should I review first?");
  }

  suggestions.push(...DEFAULT_SUGGESTED_QUERIES);
  return Array.from(new Set(suggestions)).slice(0, 4);
}

function BotAvatar() {
  return (
    <img
      src="/assistant-bot.svg"
      alt="Assistant bot avatar"
      className="h-10 w-10 rounded-xl border border-emerald-300/40 bg-emerald-500/10 p-1 shadow-lg shadow-emerald-500/20"
    />
  );
}

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

function CitationBadge({ type }) {
  const label = (type || "source").toUpperCase();
  const styleMap = {
    update: "border-cyan-300/40 bg-cyan-500/10 text-cyan-100",
    project: "border-emerald-300/40 bg-emerald-500/10 text-emerald-100",
    document: "border-amber-300/40 bg-amber-500/10 text-amber-100",
    directory: "border-fuchsia-300/40 bg-fuchsia-500/10 text-fuchsia-100",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${
        styleMap[type] || "border-white/30 bg-white/10 text-slate-200"
      }`}
    >
      {label}
    </span>
  );
}

export default function PersonalHelperPage() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const [activeView, setActiveView] = useState("briefing");

  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState("");
  const [briefingResult, setBriefingResult] = useState(null);

  const [query, setQuery] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState("");
  const [askResult, setAskResult] = useState(null);
  const [suggestedQueries, setSuggestedQueries] = useState(DEFAULT_SUGGESTED_QUERIES);

  useEffect(() => {
    const requested = searchParams?.get("view");
    if (requested === "ask") {
      setActiveView("ask");
    } else if (requested === "briefing") {
      setActiveView("briefing");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!session?.user) return undefined;

    let cancelled = false;
    const loadSuggestions = async () => {
      try {
        const [projectsRes, updatesRes, documentsRes] = await Promise.all([
          fetch("/api/projects", { cache: "no-store" }),
          fetch("/api/updates", { cache: "no-store" }),
          fetch("/api/documents", { cache: "no-store" }),
        ]);

        const projectsData = projectsRes.ok
          ? await projectsRes.json().catch(() => ({}))
          : {};
        const updatesData = updatesRes.ok
          ? await updatesRes.json().catch(() => ({}))
          : {};
        const documentsData = documentsRes.ok
          ? await documentsRes.json().catch(() => ({}))
          : {};

        const nextSuggestions = buildSuggestedQueries({
          projects: projectsData?.projects || [],
          updates: updatesData?.updates || [],
          documents: documentsData?.documents || [],
        });
        if (!cancelled) {
          setSuggestedQueries(nextSuggestions);
        }
      } catch (error) {
        if (!cancelled) {
          setSuggestedQueries(DEFAULT_SUGGESTED_QUERIES);
        }
      }
    };

    loadSuggestions();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const generateBriefing = async () => {
    setBriefingLoading(true);
    setBriefingError("");
    try {
      const response = await fetch("/api/personal-helper/briefing", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Unable to generate briefing.");
      }
      setBriefingResult(data);
    } catch (err) {
      setBriefingError(err.message || "Unable to generate briefing.");
    } finally {
      setBriefingLoading(false);
    }
  };

  const submitAsk = async (event) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setAskError("Enter a question.");
      return;
    }

    setAskLoading(true);
    setAskError("");
    try {
      const response = await fetch("/api/ask-the-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Unable to answer your question.");
      }
      setAskResult(data);
    } catch (err) {
      setAskError(err.message || "Unable to answer your question.");
    } finally {
      setAskLoading(false);
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
      <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-6 px-6 py-14">
        <header className="rounded-2xl border border-cyan-300/20 bg-cyan-900/10 p-6 shadow-xl shadow-black/30 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
            Personal Helper
          </p>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-cyan-50">
                Your portal copilot
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-cyan-50/80">
                One assistant for daily briefings and natural-language Q&A across
                updates, projects, documents, and directory records.
              </p>
            </div>
            <div className="hidden sm:block">
              <BotAvatar />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveView("briefing")}
              className={`rounded-full border px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                activeView === "briefing"
                  ? "border-cyan-100/70 bg-cyan-500/25 text-cyan-100"
                  : "border-cyan-200/30 bg-cyan-500/10 text-cyan-100/80 hover:border-cyan-100/60"
              }`}
            >
              Briefing Mode
            </button>
            <button
              type="button"
              onClick={() => setActiveView("ask")}
              className={`rounded-full border px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                activeView === "ask"
                  ? "border-emerald-100/70 bg-emerald-500/25 text-emerald-100"
                  : "border-emerald-200/30 bg-emerald-500/10 text-emerald-100/80 hover:border-emerald-100/60"
              }`}
            >
              Ask Mode
            </button>
            <Link
              href="/"
              className="rounded-full border border-white/20 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 transition hover:border-white/40"
            >
              Back to Home
            </Link>
          </div>
        </header>

        {activeView === "briefing" && (
          <>
            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-inner shadow-black/30">
              <div className="flex items-center gap-3">
                <BotAvatar />
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/80">
                    Personal Helper
                  </p>
                  <p className="text-sm text-slate-200">
                    I can generate your executive summary from today&apos;s signals.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={generateBriefing}
                  disabled={briefingLoading}
                  className="rounded-full border border-cyan-200/40 bg-cyan-500/15 px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-100/70 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {briefingLoading ? "Generating..." : "Generate Briefing"}
                </button>
              </div>
              {briefingError && (
                <div className="mt-4 rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {briefingError}
                </div>
              )}
            </section>

            {briefingResult && (
              <>
                <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 uppercase tracking-[0.12em] text-slate-200">
                      Source:{" "}
                      {briefingResult.source === "ollama"
                        ? "Ollama"
                        : briefingResult.source === "fallback"
                          ? "Fallback"
                          : briefingResult.source || "Unknown"}
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 uppercase tracking-[0.12em] text-slate-200">
                      Model: {briefingResult.model || "n/a"}
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 uppercase tracking-[0.12em] text-slate-200">
                      Open tasks: {briefingResult?.signals?.taskCount ?? 0}
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 uppercase tracking-[0.12em] text-slate-200">
                      Feed items: {(briefingResult?.signals?.updateCount ?? 0) + (briefingResult?.signals?.calendarCount ?? 0)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-300">
                    Generated{" "}
                    {briefingResult.generatedAt
                      ? new Date(briefingResult.generatedAt).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "just now"}
                  </p>
                  {briefingResult?.briefing?.overallSummary && (
                    <div className="mt-3 flex items-start gap-3 rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-3">
                      <BotAvatar />
                      <div>
                        <p className="text-[0.65rem] uppercase tracking-[0.14em] text-cyan-100/80">
                          Personal Helper Summary
                        </p>
                        <p className="mt-1 text-sm text-cyan-50">
                          {briefingResult.briefing.overallSummary}
                        </p>
                      </div>
                    </div>
                  )}
                  {Array.isArray(briefingResult.warnings) && briefingResult.warnings.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {briefingResult.warnings.map((warning, index) => (
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
                    items={briefingResult?.briefing?.whatMatters}
                  />
                  <SectionCard title="My Tasks" items={briefingResult?.briefing?.myTasks} />
                  <SectionCard title="Risks" items={briefingResult?.briefing?.risks} />
                </div>
              </>
            )}
          </>
        )}

        {activeView === "ask" && (
          <>
            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-inner shadow-black/30">
              <div className="flex items-center gap-3">
                <BotAvatar />
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-emerald-200/80">
                    Personal Helper
                  </p>
                  <p className="text-sm text-slate-200">
                    Ask me anything about the portal and I&apos;ll cite my sources.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {suggestedQueries.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setQuery(suggestion)}
                    className="rounded-full border border-emerald-200/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-100/70 hover:bg-emerald-500/20"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-inner shadow-black/30">
              <form className="flex flex-col gap-3" onSubmit={submitAsk}>
                <label className="text-sm font-semibold text-white" htmlFor="assistant-query">
                  Your question
                </label>
                <textarea
                  id="assistant-query"
                  rows={4}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Example: Which projects are blocked and who owns them?"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 focus:border-emerald-300/50 focus:outline-none"
                />
                <div>
                  <button
                    type="submit"
                    disabled={askLoading}
                    className="rounded-full border border-emerald-200/40 bg-emerald-500/20 px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100 transition hover:border-emerald-100/70 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {askLoading ? "Answering..." : "Ask Personal Helper"}
                  </button>
                </div>
              </form>
              {askError && (
                <div className="mt-4 rounded-lg border border-rose-300/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-100">
                  {askError}
                </div>
              )}
            </section>

            {askResult && (
              <>
                <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 uppercase tracking-[0.12em] text-slate-200">
                      Source: {askResult.source || "unknown"}
                    </span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 uppercase tracking-[0.12em] text-slate-200">
                      Model: {askResult.model || "n/a"}
                    </span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 uppercase tracking-[0.12em] text-slate-200">
                      Citations: {Array.isArray(askResult.citations) ? askResult.citations.length : 0}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-300">
                    Generated{" "}
                    {askResult.generatedAt
                      ? new Date(askResult.generatedAt).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "just now"}
                  </p>
                  <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-3">
                    <BotAvatar />
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-[0.14em] text-emerald-100/80">
                        Personal Helper Answer
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-emerald-50">
                        {askResult.answer || "No answer returned."}
                      </p>
                    </div>
                  </div>
                  {Array.isArray(askResult.warnings) && askResult.warnings.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {askResult.warnings.map((warning, index) => (
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

                <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-inner shadow-black/30">
                  <h2 className="text-lg font-semibold text-white">Citations</h2>
                  {Array.isArray(askResult.citations) && askResult.citations.length > 0 ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {askResult.citations.map((citation) => (
                        <Link
                          key={citation.id}
                          href={citation.path || "/"}
                          className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-emerald-300/50 hover:bg-emerald-500/5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                              {citation.id}
                            </p>
                            <CitationBadge type={citation.type} />
                          </div>
                          <p className="mt-2 text-sm font-semibold text-white">{citation.title}</p>
                          {citation.excerpt && (
                            <p className="mt-2 text-xs leading-relaxed text-slate-300">
                              {citation.excerpt}
                            </p>
                          )}
                          {citation.timestamp && (
                            <p className="mt-2 text-[0.7rem] text-slate-400">
                              {new Date(citation.timestamp).toLocaleString("en-US", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </p>
                          )}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-300">
                      No citations available for this answer.
                    </p>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
