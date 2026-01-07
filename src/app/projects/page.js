"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

const statusColor = {
  planned: "bg-slate-700 text-slate-100 border-slate-500/60",
  in_progress: "bg-emerald-900/60 text-emerald-100 border-emerald-400/50",
  blocked: "bg-amber-900/60 text-amber-100 border-amber-400/50",
  done: "bg-emerald-800 text-emerald-50 border-emerald-300/60",
};

const formatDate = (value) => {
  if (!value) return "No date";
  try {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return "No date";
  }
};

function ProjectCard({ project, onSelect, selected }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(project)}
      className={`rounded-2xl border px-4 py-4 text-left shadow-inner transition ${
        selected
          ? "border-emerald-400/60 bg-emerald-900/20 shadow-emerald-500/20"
          : "border-white/10 bg-slate-900/70 hover:border-emerald-400/30"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">{project.title}</h3>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
            statusColor[project.status] || "bg-slate-800 text-slate-100 border-white/10"
          }`}
        >
          {STATUS_OPTIONS.find((s) => s.value === project.status)?.label || project.status}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-300 line-clamp-2">
        {project.summary || "No summary"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
        {project.dueDate && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/40 bg-emerald-900/50 px-3 py-1 text-emerald-100">
            Due {formatDate(project.dueDate)}
          </span>
        )}
        {Array.isArray(project.departments) &&
          project.departments.map((dept) => (
            <span
              key={dept}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-800/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-100"
            >
              {dept}
            </span>
          ))}
        {Array.isArray(project.tags) &&
          project.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-950/40 px-3 py-1 text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-emerald-100"
            >
              {tag}
            </span>
          ))}
      </div>
    </button>
  );
}

export default function ProjectsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const userId = session?.user?.id;

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedId, setSelectedId] = useState("");

  const [departments, setDepartments] = useState([]);
  const [deptError, setDeptError] = useState("");
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const blankForm = {
    title: "",
    summary: "",
    status: "planned",
    departments: [],
    dueDate: "",
    tags: "",
    assignments: [],
  };
  const [form, setForm] = useState(blankForm);
  const [formError, setFormError] = useState("");
  const [formNotice, setFormNotice] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [instructionText, setInstructionText] = useState("");
  const [instructionScope, setInstructionScope] = useState("assignment");
  const [instructionTarget, setInstructionTarget] = useState("");
  const [instructionError, setInstructionError] = useState("");
  const [instructionSaving, setInstructionSaving] = useState(false);
  const [instructionUpdatingId, setInstructionUpdatingId] = useState("");
  const [instructionDeletingId, setInstructionDeletingId] = useState("");
  const [editingInstructionId, setEditingInstructionId] = useState("");

  const loadProjects = async (options = {}) => {
    const { silent = false } = options;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to load projects.");
      }
    const normalized = (data.projects ?? [])
      .map((p) => {
        const idSource = p._id || p.id;
        const id = typeof idSource === "string" ? idSource : idSource?.toString?.();
        if (!id) return null;
        return {
          ...p,
          _id: id,
          createdBy: p.createdBy || null,
          assignments: (p.assignments || []).map((a) => {
            const aidSource = a.userId || a._id;
            const aid = typeof aidSource === "string" ? aidSource : aidSource?.toString?.();
            return {
              ...a,
              userId: aid || "",
              instructions: (a.instructions || []).map((ins) => {
                const iidSource = ins._id || ins.id;
                const iid = typeof iidSource === "string" ? iidSource : iidSource?.toString?.();
                return { ...ins, _id: iid || "" };
              }),
            };
          }),
            generalInstructions: (p.generalInstructions || []).map((ins) => {
              const iidSource = ins._id || ins.id;
              const iid = typeof iidSource === "string" ? iidSource : iidSource?.toString?.();
              return { ...ins, _id: iid || "" };
            }),
          };
        })
        .filter(Boolean);
      setProjects(normalized);
      if (normalized.length) {
        setSelected((prev) => {
          const currentId = prev?._id;
          const match = currentId ? normalized.find((p) => p._id === currentId) : null;
          if (match) {
            setSelectedId(match._id);
            return match;
          }
          const first = normalized[0];
          const pid = first?._id || first?.id;
          if (pid) {
            setSelectedId(pid);
            return { ...first, _id: pid };
          }
          setSelectedId("");
          return first;
        });
      } else {
        setSelected(null);
        setSelectedId("");
      }
    } catch (err) {
      if (!silent) {
        setError(err.message || "Unable to load projects.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadDepartments = async () => {
    try {
      const res = await fetch("/api/departments", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to load departments.");
      }
      setDepartments(data.departments ?? []);
    } catch (err) {
      setDeptError(err.message || "Unable to load departments.");
    }
  };

  const loadUsers = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to load users.");
      }
      setUsers(data.users ?? []);
    } catch (err) {
      setUsersError(err.message || "Unable to load users.");
    }
  };

  useEffect(() => {
    loadProjects();
    loadDepartments();
    loadUsers();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadProjects({ silent: true });
      }
    };

    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadProjects({ silent: true });
      }
    }, 10000);

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.role]);

  const filteredUsers = useMemo(() => {
    if (!isAdmin || form.departments.length === 0) return users;
    return users.filter((u) => {
      const depts = Array.isArray(u.departments) ? u.departments : u.department ? [u.department] : [];
      return depts.some((d) => form.departments.includes(d));
    });
  }, [users, isAdmin, form.departments]);

  const toggleDepartment = (dept) => {
    setForm((prev) => {
      const exists = prev.departments.includes(dept);
      const next = exists ? prev.departments.filter((d) => d !== dept) : [...prev.departments, dept];
      return { ...prev, departments: next };
    });
  };

  const toggleAssignment = (user) => {
    setForm((prev) => {
      const exists = prev.assignments.find((a) => a.userId === user._id);
      const next = exists
        ? prev.assignments.filter((a) => a.userId !== user._id)
        : [...prev.assignments, { userId: user._id, name: user.name, email: user.email }];
      return { ...prev, assignments: next };
    });
  };

  const startEdit = (project) => {
    setEditingId(project._id);
    setForm({
      title: project.title || "",
      summary: project.summary || "",
      status: project.status || "planned",
      departments: project.departments || [],
      dueDate: project.dueDate ? project.dueDate.slice(0, 10) : "",
      tags: Array.isArray(project.tags) ? project.tags.join(", ") : "",
      assignments: project.assignments || [],
    });
    setFormError("");
    setFormNotice("");
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(blankForm);
    setFormError("");
    setFormNotice("");
  };

  const submitProject = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    setFormNotice("");

    try {
      const payload = {
        ...form,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };
      if (!payload.departments.length) {
        throw new Error("Select at least one department.");
      }

      const res = await fetch(editingId ? `/api/projects/${editingId}` : "/api/projects", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to save project.");
      }
      setFormNotice(editingId ? "Project updated." : "Project created.");
      await loadProjects();
      resetForm();
    } catch (err) {
      setFormError(err.message || "Unable to save project.");
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async (projectId) => {
    if (!projectId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to delete project.");
      }
      if (selected?._id === projectId) {
        setSelected(null);
        setSelectedId("");
      }
      await loadProjects();
    } catch (err) {
      setFormError(err.message || "Unable to delete project.");
    } finally {
      setDeleting(false);
    }
  };

  const handleSelect = (project) => {
    const pid = project?._id || project?.id;
    if (!pid) return;
    setSelected({ ...project, _id: pid });
    setSelectedId(pid);
  };

  const addInstruction = async () => {
    if (!selectedId) {
      setInstructionError("Project id is required.");
      return;
    }
    setInstructionSaving(true);
    setInstructionError("");
    try {
      const method = editingInstructionId ? "PATCH" : "POST";
      const res = await fetch(`/api/projects/${selectedId}/instructions`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructionId: editingInstructionId || undefined,
          text: instructionText,
          scope: instructionScope,
          userId: instructionScope === "assignment" ? instructionTarget || userId : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to add instruction.");
      }
      setInstructionText("");
      setInstructionTarget("");
      setEditingInstructionId("");
      await loadProjects();
    } catch (err) {
      setInstructionError(err.message || "Unable to add instruction.");
    } finally {
      setInstructionSaving(false);
    }
  };

  const toggleInstructionDone = async (assignmentUserId, instructionId, nextDone) => {
    if (!selectedId) {
      setInstructionError("Project id is required.");
      return;
    }
    setInstructionUpdatingId(instructionId);
    setInstructionError("");
    try {
      const res = await fetch(`/api/projects/${selectedId}/instructions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructionId,
          scope: "assignment",
          userId: assignmentUserId,
          done: nextDone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update instruction.");
      }
      await loadProjects({ silent: true });
    } catch (err) {
      setInstructionError(err.message || "Unable to update instruction.");
    } finally {
      setInstructionUpdatingId("");
    }
  };

  const deleteInstruction = async (scope, instructionId, assignmentUserId) => {
    if (!selectedId) {
      setInstructionError("Project id is required.");
      return;
    }
    setInstructionDeletingId(instructionId);
    setInstructionError("");
    try {
      const payload = {
        instructionId,
        scope,
        userId: scope === "assignment" ? assignmentUserId : undefined,
      };
      const res = await fetch(`/api/projects/${selectedId}/instructions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to delete instruction.");
      }
      await loadProjects({ silent: true });
    } catch (err) {
      setInstructionError(err.message || "Unable to delete instruction.");
    } finally {
      setInstructionDeletingId("");
    }
  };

  const currentAssignment = useMemo(() => {
    if (!selected || !userId) return null;
    return (selected.assignments || []).find((a) => a.userId === userId) || null;
  }, [selected, userId]);

  const isOwner = selected?.createdBy?.id === userId;
  const canDeleteInstruction = isAdmin || isOwner;

  const canEditInstruction = (insAuthorId) => {
    return isAdmin || isOwner || insAuthorId === userId;
  };

  const visibleProjects = projects;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-emerald-300/80">
              Projects
            </p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Team projects
            </h1>
            <span className="text-sm text-slate-300">
              {isAdmin
                ? "Browse and manage projects across all departments."
                : "See the projects you are assigned to."}
            </span>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-full border border-emerald-300/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-50 shadow-lg shadow-emerald-500/20 transition hover:-translate-y-[1px]"
            >
              New project
            </button>
          )}
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/30">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Latest projects</h2>
              <span className="text-xs text-slate-300">
                {loading ? "Loading..." : `${visibleProjects.length} item(s)`}
              </span>
            </div>
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 rounded-2xl border border-white/5 bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : visibleProjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-5 py-10 text-center text-slate-300">
                {isAdmin ? "No projects yet. Create one to get started." : "No project assigned."}
              </div>
            ) : (
              <div className="grid gap-3">
                {visibleProjects.map((project) => (
                    <ProjectCard
                      key={project._id}
                      project={project}
                      selected={selected?._id === project._id}
                      onSelect={handleSelect}
                    />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-emerald-300/30 bg-emerald-900/30 p-5 shadow-xl shadow-emerald-500/20">
            {selected ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.26em] text-emerald-200/80">
                      Project detail
                    </p>
                    <h2 className="text-2xl font-semibold text-white">{selected.title}</h2>
                    <p className="text-sm text-emerald-100/80">{selected.summary || "No summary"}</p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                      statusColor[selected.status] || "bg-slate-800 text-slate-100 border-white/10"
                    }`}
                  >
                    {STATUS_OPTIONS.find((s) => s.value === selected.status)?.label || selected.status}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-emerald-100/90">
                  {selected.dueDate && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/40 bg-emerald-950/50 px-3 py-1">
                      Due {formatDate(selected.dueDate)}
                    </span>
                  )}
                  {Array.isArray(selected.departments) &&
                    selected.departments.map((dept) => (
                      <span
                        key={dept}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200/40 bg-emerald-950/50 px-3 py-1 font-semibold uppercase tracking-[0.12em]"
                      >
                        {dept}
                      </span>
                    ))}
                  {Array.isArray(selected.tags) &&
                    selected.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200/40 bg-emerald-950/50 px-3 py-1 font-semibold uppercase tracking-[0.12em]"
                      >
                        {tag}
                      </span>
                    ))}
                </div>

                <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Assignments</h3>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => startEdit(selected)}
                        className="text-xs font-semibold text-emerald-100 underline"
                      >
                        Edit project
                      </button>
                    )}
                  </div>
                  {Array.isArray(selected.assignments) && selected.assignments.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {selected.assignments.map((a) => (
                        <div
                          key={a.userId}
                          className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-2 text-sm text-white">
                            <span>{a.name || a.email || "User"}</span>
                            <span className="text-[0.75rem] text-emerald-100">
                              {(a.departments || []).join(", ") || "No dept"}
                            </span>
                          </div>
                          {Array.isArray(a.instructions) && a.instructions.length > 0 && (
                            <ul className="space-y-1 text-xs text-emerald-50/90">
                              {a.instructions.map((ins) => (
                                <li
                                  key={ins._id || ins.text}
                                  className="flex items-start justify-between gap-3 rounded bg-emerald-500/10 px-2 py-1"
                                >
                                  <div>
                                    <div
                                      className={ins.done ? "line-through text-emerald-200/70" : ""}
                                    >
                                      {ins.text}
                                    </div>
                                    {ins.authorName && (
                                      <span className="text-[0.68rem] text-emerald-100/70">
                                        by {ins.authorName}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {userId === a.userId && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleInstructionDone(a.userId, ins._id, !ins.done)
                                        }
                                        disabled={instructionUpdatingId === ins._id}
                                        className={`text-[0.7rem] underline disabled:opacity-60 ${
                                          ins.done
                                            ? "font-bold text-emerald-200"
                                            : "font-semibold text-red-200"
                                        }`}
                                      >
                                        {ins.done ? "Done" : "Undone"}
                                      </button>
                                    )}
                                    {canEditInstruction(ins.authorId) && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setInstructionScope("assignment");
                                          setInstructionTarget(a.userId);
                                          setEditingInstructionId(ins._id || "");
                                          setInstructionText(ins.text || "");
                                        }}
                                        className="text-[0.7rem] font-semibold text-emerald-100 underline"
                                      >
                                        Edit
                                      </button>
                                    )}
                                    {canDeleteInstruction && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          deleteInstruction("assignment", ins._id, a.userId)
                                        }
                                        disabled={instructionDeletingId === ins._id}
                                        className="text-[0.7rem] font-semibold text-red-200 underline disabled:opacity-60"
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-300">No assignments yet.</p>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-white">General instructions</h3>
                  {Array.isArray(selected.generalInstructions) && selected.generalInstructions.length > 0 ? (
                    <ul className="space-y-2 text-sm text-emerald-50/90">
                      {selected.generalInstructions.map((ins) => (
                        <li
                          key={ins._id || ins.text}
                          className="flex items-start justify-between gap-2 rounded border border-emerald-300/20 bg-emerald-500/10 px-3 py-2"
                        >
                          <div>
                            <div className="text-emerald-50">{ins.text}</div>
                            {ins.authorName && (
                              <div className="text-[0.7rem] text-emerald-100/70 mt-1">
                                {ins.authorName}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {canEditInstruction(ins.authorId) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setInstructionScope("general");
                                  setInstructionTarget("");
                                  setEditingInstructionId(ins._id || "");
                                  setInstructionText(ins.text || "");
                                }}
                                className="text-[0.7rem] font-semibold text-emerald-100 underline"
                              >
                                Edit
                              </button>
                            )}
                            {canDeleteInstruction && (
                              <button
                                type="button"
                                onClick={() => deleteInstruction("general", ins._id)}
                                disabled={instructionDeletingId === ins._id}
                                className="text-[0.7rem] font-semibold text-red-200 underline disabled:opacity-60"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-300">No general instructions yet.</p>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-emerald-900/40 p-4">
                  <h3 className="text-sm font-semibold text-white mb-2">Add instruction</h3>
                  {instructionError && (
                    <div className="mb-2 rounded border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      {instructionError}
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {isAdmin && (
                      <div className="flex items-center gap-3 text-xs text-emerald-50">
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            checked={instructionScope === "assignment"}
                            onChange={() => {
                              setInstructionScope("assignment");
                              setEditingInstructionId("");
                              setInstructionText("");
                            }}
                          />
                          <span>Assignment</span>
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            checked={instructionScope === "general"}
                            onChange={() => {
                              setInstructionScope("general");
                              setInstructionTarget("");
                              setEditingInstructionId("");
                              setInstructionText("");
                            }}
                          />
                          <span>General</span>
                        </label>
                      </div>
                    )}
                    {instructionScope === "assignment" && (
                      <select
                        value={instructionTarget || currentAssignment?.userId || ""}
                        onChange={(e) => setInstructionTarget(e.target.value)}
                        className="rounded-lg border border-emerald-300/40 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-50 focus:border-emerald-200/70 focus:outline-none"
                      >
                        <option value="">Choose assignee</option>
                        {(selected.assignments || []).map((a) => (
                          <option key={a.userId} value={a.userId}>
                            {a.name || a.email || "User"}
                          </option>
                        ))}
                      </select>
                    )}
                    <textarea
                      rows={3}
                      value={instructionText}
                      onChange={(e) => setInstructionText(e.target.value)}
                      placeholder="Add an instruction..."
                      className="w-full rounded-lg border border-emerald-300/40 bg-emerald-950/60 px-3 py-2 text-sm text-emerald-50 placeholder:text-emerald-50/60 focus:border-emerald-200/70 focus:outline-none focus:ring-2 focus:ring-emerald-300/40"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={addInstruction}
                        disabled={instructionSaving || !instructionText.trim()}
                        className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {instructionSaving
                          ? "Saving..."
                          : editingInstructionId
                            ? "Update instruction"
                            : "Add instruction"}
                      </button>
                      {instructionScope === "assignment" && !currentAssignment && !isAdmin && (
                        <span className="text-xs text-amber-100">
                          You must be assigned to add instructions.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-emerald-100/80">
                Select a project to view details.
              </div>
            )}
          </div>
        </section>

        {isAdmin && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/30">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {editingId ? "Edit project" : "Create project"}
                </h2>
                <p className="text-sm text-slate-300">
                  Set details, departments, and assignments.
                </p>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-semibold text-emerald-100 underline"
                >
                  Cancel edit
                </button>
              )}
            </div>
            {formError && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-100">
                {formError}
              </div>
            )}
            {formNotice && (
              <div className="mb-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-50">
                {formNotice}
              </div>
            )}
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitProject}>
              <label className="flex flex-col gap-2 text-sm font-semibold text-white">
                Title
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-base text-white placeholder:text-slate-400 focus:border-emerald-300/50 focus:outline-none"
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-white">
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-base text-white focus:border-emerald-300/50 focus:outline-none"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-white sm:col-span-2">
                Summary
                <textarea
                  rows={3}
                  value={form.summary}
                  onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-base text-white placeholder:text-slate-400 focus:border-emerald-300/50 focus:outline-none"
                  placeholder="What is this project about?"
                />
              </label>
              <div className="grid grid-cols-2 gap-4 sm:col-span-2 sm:grid-cols-3">
                <label className="flex flex-col gap-2 text-sm font-semibold text-white">
                  Due date
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-base text-white focus:border-emerald-300/50 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold text-white sm:col-span-2">
                  Tags (comma separated)
                  <input
                    type="text"
                    value={form.tags}
                    onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
                    className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-base text-white placeholder:text-slate-400 focus:border-emerald-300/50 focus:outline-none"
                    placeholder="product, q1, migration"
                  />
                </label>
              </div>

              <div className="sm:col-span-2">
                <div className="mb-2 flex items-center justify-between text-sm font-semibold text-white">
                  <span>Departments (at least one)</span>
                  {deptError && <span className="text-xs text-amber-200">{deptError}</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {departments.map((dept) => {
                    const selectedDept = form.departments.includes(dept.name);
                    return (
                      <button
                        key={dept._id || dept.name}
                        type="button"
                        onClick={() => toggleDepartment(dept.name)}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                          selectedDept
                            ? "border-emerald-300/60 bg-emerald-500/20 text-emerald-50"
                            : "border-white/15 bg-slate-900/70 text-slate-100 hover:border-emerald-200/40"
                        }`}
                      >
                        {dept.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-2">
                <div className="mb-2 flex items-center justify-between text-sm font-semibold text-white">
                  <span>Assignments (same-department users)</span>
                  {usersError && <span className="text-xs text-amber-200">{usersError}</span>}
                </div>
                {form.departments.length === 0 ? (
                  <p className="text-xs text-amber-100">Select departments to choose assignees.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {filteredUsers.map((u) => {
                      const assigned = form.assignments.some((a) => a.userId === u._id);
                      return (
                        <button
                          key={u._id}
                          type="button"
                          onClick={() => toggleAssignment(u)}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
                            assigned
                              ? "border-emerald-300/60 bg-emerald-500/15 text-emerald-50"
                              : "border-white/10 bg-slate-900/70 text-slate-100 hover:border-emerald-200/40"
                          }`}
                        >
                          <span>{u.name || u.email}</span>
                          <span className="text-[0.7rem] text-emerald-100">
                            {(u.departments || []).join(", ")}
                          </span>
                        </button>
                      );
                    })}
                    {filteredUsers.length === 0 && (
                      <p className="text-xs text-amber-100">
                        No users in these departments. Add departments or users first.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : editingId ? "Update project" : "Create project"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => deleteProject(editingId)}
                    disabled={deleting}
                    className="text-sm font-semibold text-red-200 underline"
                  >
                    {deleting ? "Deleting..." : "Delete project"}
                  </button>
                )}
              </div>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}


