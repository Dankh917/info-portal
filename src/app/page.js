"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ProjectSearch from "./project-search";
import ParticleBackground from "./particle-background";

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

const statusStyle = (status) => {
  switch (status) {
    case "planned":
      return "border-slate-400/40 bg-slate-500/10 text-slate-200";
    case "in_progress":
      return "border-emerald-300/40 bg-emerald-500/10 text-emerald-100";
    case "blocked":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100";
    case "done":
      return "border-emerald-300/50 bg-emerald-500/20 text-emerald-50";
    default:
      return "border-white/20 bg-white/5 text-slate-200";
  }
};

const formatStatus = (status) => {
  if (!status) return "unknown";
  return status.replaceAll("_", " ");
};

export default function Home() {
  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = session?.user?.id;
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    message: "",
    happensAtDate: getTodayDate(),
    happensAtTime: "",
    tags: [],
    departments: ["General"],
    source: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tags, setTags] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsError, setTagsError] = useState("");
  const [departments, setDepartments] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [departmentsError, setDepartmentsError] = useState("");
  const [editingUpdate, setEditingUpdate] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", message: "" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [favoriteProjects, setFavoriteProjects] = useState([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [favoritesError, setFavoritesError] = useState("");
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const updateFormRef = useRef(null);
  const prefillAppliedRef = useRef(false);
  const [pendingPrefill, setPendingPrefill] = useState(null);

  const quickLinks = [
    {
      name: "Workday",
      description: "Time off, payroll, and org info.",
      url: "https://www.workday.com/",
    },
    {
      name: "Notion",
      description: "Team docs and project hubs.",
      url: "https://www.notion.so/",
    },
    {
      name: "Slack",
      description: "Daily comms and quick updates.",
      url: "https://slack.com/",
    },
    {
      name: "Zoom",
      description: "Meetings and live sessions.",
      url: "https://zoom.us/",
    },
    {
      name: "Confluence",
      description: "Process docs and knowledge base.",
      url: "https://www.atlassian.com/software/confluence",
    },
    {
      name: "Google Drive",
      description: "Shared files and team assets.",
      url: "https://drive.google.com/",
    },
  ];

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

    const loadDepartments = async () => {
      setDepartmentsLoading(true);
      setDepartmentsError("");

      try {
        const res = await fetch("/api/departments", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Unable to load departments.");
        }

        setDepartments(data.departments ?? []);
      } catch (err) {
        setDepartmentsError(err.message || "Unable to load departments.");
      } finally {
        setDepartmentsLoading(false);
      }
    };

    loadUpdates();
    loadTags();
    loadDepartments();
  }, []);

  useEffect(() => {
    if (!searchParams || prefillAppliedRef.current) return;
    if (searchParams.get("fromEvent") !== "1") return;

    const tagsParam = searchParams.get("tags") || "";
    const departmentsParam = searchParams.get("departments") || "";
    const parseList = (value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    setPendingPrefill({
      title: searchParams.get("title") || "",
      message: searchParams.get("message") || "",
      happensAtDate: searchParams.get("date") || "",
      happensAtTime: searchParams.get("time") || "",
      tags: parseList(tagsParam),
      departments: parseList(departmentsParam),
    });
  }, [searchParams]);

  useEffect(() => {
    const loadFavorites = async () => {
      setFavoritesLoading(true);
      setFavoritesError("");

      try {
        const res = await fetch("/api/projects", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Unable to load favorites.");
        }

        const favorites = new Set(
          Array.isArray(data.favoriteProjectIds) ? data.favoriteProjectIds : [],
        );
        const projects = Array.isArray(data.projects) ? data.projects : [];
        const onlyFavorites = projects.filter(
          (project) => favorites.has(project._id) || project.isFavorite,
        );

        setFavoriteProjects(onlyFavorites);
      } catch (err) {
        setFavoritesError(err.message || "Unable to load favorites.");
        setFavoriteProjects([]);
      } finally {
        setFavoritesLoading(false);
      }
    };

    if (!session?.user) {
      setFavoriteProjects([]);
      setFavoritesError("");
      setFavoritesLoading(false);
      return;
    }

    loadFavorites();
  }, [session?.user]);

  useEffect(() => {
    if (!pendingPrefill) return;
    if (tagsLoading || departmentsLoading) return;
    if (prefillAppliedRef.current) return;

    const normalize = (value) => value.trim().toLowerCase();
    const tagLookup = new Map(tags.map((tag) => [normalize(tag.name), tag.name]));
    const deptLookup = new Map(
      departments.map((dept) => [normalize(dept.name), dept.name])
    );

    const selectedTags = pendingPrefill.tags
      .map((tag) => tagLookup.get(normalize(tag)))
      .filter(Boolean);
    const selectedDepartments = pendingPrefill.departments
      .map((dept) => deptLookup.get(normalize(dept)))
      .filter(Boolean);
    const shouldForceDepartmentPick = pendingPrefill.departments.length === 0;

    setForm((f) => ({
      ...f,
      title: pendingPrefill.title,
      message: pendingPrefill.message,
      happensAtDate: pendingPrefill.happensAtDate || f.happensAtDate,
      happensAtTime: pendingPrefill.happensAtTime || "",
      tags: Array.from(new Set(selectedTags)),
      departments: shouldForceDepartmentPick
        ? []
        : Array.from(new Set(selectedDepartments)),
      source: "calendar",
    }));
    setShowUpdateForm(true);
    prefillAppliedRef.current = true;
    setPendingPrefill(null);
    router.replace("/", { scroll: false });
  }, [
    pendingPrefill,
    tags,
    departments,
    tagsLoading,
    departmentsLoading,
    router,
  ]);

  useEffect(() => {
    if (!showUpdateForm || !updateFormRef.current) return;
    const frame = requestAnimationFrame(() => {
      updateFormRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [showUpdateForm]);


  const toggleTag = (tagName) => {
    setForm((f) => {
      const exists = f.tags.includes(tagName);
      const nextTags = exists
        ? f.tags.filter((tag) => tag !== tagName)
        : [...f.tags, tagName];
      return { ...f, tags: nextTags };
    });
  };

  const toggleDepartment = (deptName) => {
    setForm((f) => {
      const exists = f.departments.includes(deptName);
      const nextDepartments = exists
        ? f.departments.filter((dept) => dept !== deptName)
        : [...f.departments, deptName];
      return { ...f, departments: nextDepartments.length ? nextDepartments : ["General"] };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setPosting(true);
    setError("");
    setNotice("");

    // Make date required
    if (!form.happensAtDate) {
      setError("Upload date is required.");
      setPosting(false);
      return;
    }

    const happensAt = `${form.happensAtDate}T${form.happensAtTime || "00:00"}`;

    try {
      const res = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          message: form.message,
          happensAt,
          tags: form.tags,
          departments: form.departments,
          source: form.source,
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
        happensAtDate: getTodayDate(),
        happensAtTime: "",
        tags: [],
        departments: ["General"],
        source: "",
      });
      setNotice("Update posted successfully.");
      setShowUpdateForm(false);
    } catch (err) {
      setError(err.message || "Unable to save update.");
    } finally {
      setPosting(false);
    }
  };

  const handleEdit = (update) => {
    setEditingUpdate(update);
    setEditForm({ title: update.title, message: update.message });
  };

  const handleCancelEdit = () => {
    setEditingUpdate(null);
    setEditForm({ title: "", message: "" });
  };

  const handleSaveEdit = async () => {
    if (!editingUpdate || !editForm.title.trim() || !editForm.message.trim()) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/updates/${editingUpdate._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim(),
          message: editForm.message.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Unable to update.");
      }

      setUpdates((prev) =>
        prev.map((u) =>
          u._id === editingUpdate._id
            ? { ...u, title: editForm.title.trim(), message: editForm.message.trim() }
            : u
        )
      );
      setEditingUpdate(null);
      setEditForm({ title: "", message: "" });
    } catch (err) {
      alert(err.message || "Failed to update.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (updateId) => {
    if (!confirm("Are you sure you want to delete this update?")) {
      return;
    }

    setDeleting(updateId);
    try {
      const res = await fetch(`/api/updates/${updateId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Unable to delete.");
      }

      setUpdates((prev) => prev.filter((u) => u._id !== updateId));
    } catch (err) {
      alert(err.message || "Failed to delete.");
    } finally {
      setDeleting(null);
    }
  };

  const canEditOrDelete = (update) => {
    if (!session?.user) return false;
    return update.authorId === session.user.id || session.user.role === "admin";
  };

  const disableSubmit =
    posting ||
    !form.title.trim() ||
    !form.message.trim() ||
    tagsLoading ||
    departmentsLoading ||
    form.tags.length === 0 ||
    form.departments.length === 0;
  const showFavorites = favoritesLoading || favoriteProjects.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <ParticleBackground />
      <main className="relative z-10 mx-auto flex max-w-5xl flex-col gap-12 px-6 py-16">
        <header className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                Company Hub
              </h1>
              <span className="text-sm text-slate-300">
                Stay aligned with the latest announcements.
              </span>
            </div>
          </div>
        </header>

        <ProjectSearch />

        <section
          className={
            showFavorites
              ? "grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start"
              : "grid gap-6"
          }
        >
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30 backdrop-blur">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Latest updates</h2>
              <div className="flex items-center gap-3">
                {loading ? (
                  <span className="text-xs text-slate-300">Loading...</span>
                ) : (
                  <span className="text-xs text-slate-300">
                    {updates.length} {updates.length === 1 ? "item" : "items"}
                  </span>
                )}
                <Link
                  href="/archivedupdates"
                  className="rounded-full border border-slate-200/30 bg-slate-950/50 px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-50 transition hover:border-slate-200/60 hover:bg-slate-900/70"
                >
                  Archive
                </Link>
                <button
                  type="button"
                  onClick={() => setShowUpdateForm((prev) => !prev)}
                  className="rounded-full border border-emerald-200/30 bg-emerald-950/50 px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-emerald-50 transition hover:border-emerald-200/60 hover:bg-emerald-900/70"
                >
                  {showUpdateForm ? "Close" : "Post update"}
                </button>
              </div>
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
                        className="relative rounded-xl border border-white/10 bg-slate-900/70 px-5 py-4 shadow-inner shadow-black/40"
                      >
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <h3 className="text-lg font-semibold text-white">
                            {update.title}
                          </h3>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">
                              {formatDate(update.createdAt)}
                            </span>
                            {canEditOrDelete(update) && (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleEdit(update)}
                                  className="rounded-md bg-blue-500/20 px-2 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/30"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(update._id)}
                                  disabled={deleting === update._id}
                                  className="rounded-md bg-red-500/20 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                                >
                                  {deleting === update._id ? "..." : "Delete"}
                                </button>
                              </div>
                            )}
                          </div>
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
                          {Array.isArray(update.departments) &&
                            update.departments.map((dept) => (
                              <span
                                key={dept}
                                className="inline-flex items-center gap-1 rounded-full border border-emerald-200/30 bg-emerald-900/60 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-emerald-100 shadow-inner shadow-black/30"
                              >
                                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                                {dept}
                              </span>
                            ))}
                          {Array.isArray(update.tags) &&
                            update.tags.map((tag) => {
                              const name = tag?.name || tag;
                              const color = tag?.color;
                              const icon = tag?.icon || "???";
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
                        {update.source === "calendar" && (
                          <img
                            src="/assets/Calendar.png"
                            alt="Calendar update"
                            className="pointer-events-none absolute bottom-3 right-3 h-7 w-7 opacity-80"
                          />
                        )}
                      </article>
                    ))}
              </div>
            )}
          </div>

          {showFavorites && (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-900/10 p-5 shadow-xl shadow-black/30 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-amber-50">Favorite projects</h2>
                {favoritesLoading ? (
                  <span className="text-xs text-amber-100/70">Loading...</span>
                ) : (
                  <span className="text-xs text-amber-100/70">
                    {favoriteProjects.length} saved
                  </span>
                )}
              </div>
              {favoritesError && (
                <div className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {favoritesError}
                </div>
              )}
              {favoritesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div
                      key={index}
                      className="animate-pulse rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <div className="mb-2 h-3 w-28 rounded bg-white/20" />
                      <div className="h-3 w-11/12 rounded bg-white/15" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4">
                  {favoriteProjects.map((project) => {
                    const assignment = userId
                      ? (project.assignments || []).find((a) => a.userId === userId)
                      : null;
                    const instructions = Array.isArray(assignment?.instructions)
                      ? assignment.instructions
                      : [];
                    return (
                      <Link
                        key={project._id}
                        href={`/projects?id=${project._id}`}
                        className="group rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 shadow-inner shadow-black/40 transition hover:-translate-y-[1px] hover:border-amber-300/40"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-white">{project.title}</h3>
                          <span className="text-xs uppercase tracking-[0.2em] text-amber-200/80">
                            Open
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-300 line-clamp-2">
                          {project.summary || "No summary"}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.12em] text-slate-200">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-1 ${statusStyle(
                              project.status,
                            )}`}
                          >
                            {formatStatus(project.status)}
                          </span>
                          {project.dueDate && (
                            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-1 text-slate-200">
                              Due {formatDate(project.dueDate)}
                            </span>
                          )}
                        </div>
                        {Array.isArray(project.departments) && project.departments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {project.departments.slice(0, 2).map((dept) => (
                              <span
                                key={dept}
                                className="inline-flex items-center rounded-full border border-white/10 bg-slate-800/60 px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-slate-100"
                              >
                                {dept}
                              </span>
                            ))}
                          </div>
                        )}
                        {assignment && (
                          <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <div className="flex items-center justify-between gap-2 text-xs text-white">
                              <span>{assignment.name || assignment.email || "You"}</span>
                              <span className="text-[0.7rem] text-emerald-100">
                                {(assignment.departments || []).join(", ") || "No dept"}
                              </span>
                            </div>
                            {instructions.length > 0 && (
                              <ul className="mt-2 space-y-1 text-xs text-emerald-50/90">
                                {instructions.map((ins) => {
                                  const insKey = ins._id || ins.id || ins.text;
                                  return (
                                    <li
                                      key={insKey}
                                      className="flex items-start justify-between gap-3 rounded bg-emerald-500/10 px-2 py-1"
                                    >
                                      <div
                                        className={
                                          ins.done ? "line-through text-emerald-200/70" : ""
                                        }
                                      >
                                        {ins.text}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {showUpdateForm && (
          <section
            ref={updateFormRef}
            className="rounded-2xl border border-emerald-400/30 bg-emerald-900/40 p-6 shadow-xl shadow-emerald-500/20 backdrop-blur"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-emerald-50">
                  Create an update
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
                  <div className="flex items-center justify-between">
                    <span>Upload date</span>
                    <span className="text-xs uppercase tracking-[0.16em] text-emerald-100/80">
                      Required
                    </span>
                  </div>
                  <input
                    type="date"
                    required
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
                  <span>Departments (General is always allowed)</span>
                  <span className="text-xs uppercase tracking-[0.16em] text-emerald-100/80">
                    Required
                  </span>
                </div>
                {departmentsError && (
                  <div className="rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-xs font-normal text-amber-100">
                    {departmentsError}
                  </div>
                )}
                {departmentsLoading ? (
                  <div className="space-y-2 rounded-lg border border-emerald-200/20 bg-emerald-950/50 p-3">
                    <div className="h-10 rounded bg-emerald-200/20" />
                    <div className="h-6 rounded bg-emerald-200/10" />
                  </div>
                ) : departments.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200/30 bg-emerald-950/60 px-4 py-3 text-xs font-normal text-emerald-100">
                    No departments found. Ask an admin to seed defaults.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      {departments.map((dept) => {
                        const selected = form.departments.includes(dept.name);
                        return (
                          <button
                            key={dept._id || dept.name}
                            type="button"
                            onClick={() => toggleDepartment(dept.name)}
                            className={`inline-flex items-center gap-2 rounded-xl border border-emerald-200/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-50 shadow-inner shadow-black/30 transition hover:-translate-y-[1px] hover:shadow-emerald-500/30 ${
                              selected ? "bg-emerald-500/20 ring-2 ring-white/60" : "bg-emerald-950/60"
                            }`}
                          >
                            <span className="text-[0.78rem]">{dept.name}</span>
                            {selected && <span className="text-[0.7rem] text-white/90">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                    {form.departments.length === 0 && (
                      <p className="text-xs font-normal text-amber-100">
                        Pick one or more departments to post this update.
                      </p>
                    )}
                  </div>
                )}
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
                            <span className="text-sm">{tag.icon || "???"}</span>
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
          </section>
        )}

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">
                Quick links
              </p>
              <h2 className="text-2xl font-semibold">Company resources</h2>
            </div>
            <span className="text-sm text-slate-300">
              Jump to the tools you use most.
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 p-4 transition hover:-translate-y-1 hover:border-emerald-300/60 hover:shadow-lg hover:shadow-emerald-500/20"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/15 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                <div className="relative">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-lg font-semibold text-white">
                      {link.name}
                    </span>
                    <span className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                      Open
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">{link.description}</p>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Edit Modal */}
        {editingUpdate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl">
              <h3 className="mb-4 text-xl font-semibold text-white">
                Edit Update
              </h3>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                  Title
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full rounded-lg border border-white/20 bg-slate-800 px-3 py-2 text-base text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                  Message
                  <textarea
                    rows="5"
                    value={editForm.message}
                    onChange={(e) => setEditForm((f) => ({ ...f, message: e.target.value }))}
                    className="w-full rounded-lg border border-white/20 bg-slate-800 px-3 py-2 text-base text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                  />
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving || !editForm.title.trim() || !editForm.message.trim()}
                    className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
