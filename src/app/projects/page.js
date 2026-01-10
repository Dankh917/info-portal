"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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

const getDocumentExtension = (doc) => {
  const filename = doc?.title || doc?.originalName || "";
  const match = filename.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
};

const isDue = (value) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const dueUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return dueUtc <= todayUtc;
};

function FavoriteButton({ isFavorite, disabled, onToggle }) {
  const label = isFavorite ? "Unfavorite project" : "Favorite project";
  const title = disabled && !isFavorite ? "Favorite limit reached" : label;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      disabled={disabled}
      aria-pressed={isFavorite}
      aria-label={label}
      title={title}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm transition ${
        isFavorite
          ? "border-amber-300/70 bg-amber-400/20 text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.6)]"
          : "border-white/15 bg-white/5 text-slate-300 hover:border-amber-300/60 hover:text-amber-100"
      } ${disabled && !isFavorite ? "cursor-not-allowed opacity-40 hover:border-white/15 hover:text-slate-300" : ""}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill={isFavorite ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.48 3.5a.6.6 0 0 1 1.04 0l2.22 4.5a.6.6 0 0 0 .45.33l4.97.72a.6.6 0 0 1 .33 1.02l-3.6 3.5a.6.6 0 0 0-.17.53l.85 4.95a.6.6 0 0 1-.88.64L12.28 17a.6.6 0 0 0-.56 0l-4.43 2.33a.6.6 0 0 1-.88-.64l.85-4.95a.6.6 0 0 0-.17-.53l-3.6-3.5a.6.6 0 0 1 .33-1.02l4.97-.72a.6.6 0 0 0 .45-.33l2.22-4.5z"
        />
      </svg>
    </button>
  );
}

function ProjectCard({
  project,
  onSelect,
  selected,
  canManage,
  onEdit,
  onDelete,
  isFavorite,
  disableFavorite,
  onToggleFavorite,
}) {
  const due = isDue(project.dueDate);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(project)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(project);
        }
      }}
      className={`rounded-2xl border px-4 py-4 text-left shadow-inner transition transform ${
        selected
          ? "border-emerald-400/60 bg-emerald-900/20 shadow-emerald-500/20 scale-[1.01]"
          : "border-white/10 bg-slate-900/70 hover:border-emerald-400/30"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">{project.title}</h3>
        <FavoriteButton
          isFavorite={isFavorite}
          disabled={disableFavorite}
          onToggle={() => onToggleFavorite(project._id, !isFavorite)}
        />
      </div>
      <p className="mt-1 text-sm text-slate-300 line-clamp-2">
        {project.summary || "No summary"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
        {project.dueDate && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${
              due
                ? "border-rose-400/70 bg-rose-500/25 text-rose-100 shadow-[0_0_18px_rgba(248,113,113,0.6)]"
                : "border-emerald-300/40 bg-emerald-900/50 text-emerald-100"
            }`}
          >
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
      {selected && canManage && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(project);
              }}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:border-emerald-300/50 hover:text-emerald-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(project._id);
              }}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-rose-100 transition hover:border-rose-300/60 hover:text-rose-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const preferredProjectId = searchParams?.get("id") || "";
  const isAdmin = session?.user?.role === "admin";
  const isPm = session?.user?.role === "pm";
  const userId = session?.user?.id;
  const userDepartments = Array.isArray(session?.user?.departments)
    ? session.user.departments
    : [];
  const canManageProjects = isAdmin || isPm;

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedId, setSelectedId] = useState("");

  const [departments, setDepartments] = useState([]);
  const [deptError, setDeptError] = useState("");
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState("");
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favoriteError, setFavoriteError] = useState("");
  const [favoriteUpdatingId, setFavoriteUpdatingId] = useState("");

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
  const [showForm, setShowForm] = useState(false);

  const [instructionText, setInstructionText] = useState("");
  const [instructionScope, setInstructionScope] = useState("assignment");
  const [instructionTarget, setInstructionTarget] = useState("");
  const [instructionError, setInstructionError] = useState("");
  const [instructionSaving, setInstructionSaving] = useState(false);
  const [instructionUpdatingId, setInstructionUpdatingId] = useState("");
  const [instructionDeletingId, setInstructionDeletingId] = useState("");
  const [editingInstructionId, setEditingInstructionId] = useState("");
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentPickerOpen, setDocumentPickerOpen] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);

  const loadProjects = async (options = {}) => {
    const { silent = false, preferredId = "" } = options;
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
      setFavoriteIds(Array.isArray(data.favoriteProjectIds) ? data.favoriteProjectIds : []);
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
                  const iid =
                    typeof iidSource === "string" ? iidSource : iidSource?.toString?.();
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
          const currentId = preferredId || prev?._id;
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
    if (!canManageProjects) return;
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

  const loadDocuments = async () => {
    setDocumentsLoading(true);
    setDocumentsError("");
    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to load documents.");
      }
      setDocuments(data.documents ?? []);
    } catch (err) {
      setDocumentsError(err.message || "Unable to load documents.");
    } finally {
      setDocumentsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects({ preferredId: preferredProjectId });
    loadDepartments();
    loadUsers();
    loadDocuments();

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
  }, [session?.user?.role, preferredProjectId]);

  const filteredUsers = useMemo(() => {
    if (!canManageProjects || form.departments.length === 0) return users;
    return users.filter((u) => {
      const depts = Array.isArray(u.departments) ? u.departments : u.department ? [u.department] : [];
      return depts.some((d) => form.departments.includes(d));
    });
  }, [users, canManageProjects, form.departments]);

  const documentMap = useMemo(() => {
    return new Map(
      documents.map((doc) => {
        const id = doc?._id || doc?.id;
        return [id, doc];
      }),
    );
  }, [documents]);

  const visibleDocuments = useMemo(() => {
    const term = documentSearch.trim().toLowerCase();
    const list = term
      ? documents.filter((doc) => {
          const name = `${doc?.title || ""} ${doc?.originalName || ""}`.toLowerCase();
          return name.includes(term);
        })
      : documents.slice(0, 5);
    return list;
  }, [documents, documentSearch]);

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

  const toggleDocument = (docId) => {
    if (!docId) return;
    setSelectedDocumentIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
    );
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
    setShowForm(true);
  };

  const resetForm = (options = {}) => {
    setEditingId(null);
    setForm(blankForm);
    setFormError("");
    setFormNotice("");
    if (options.hide) {
      setShowForm(false);
    }
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
      if (isPm && payload.departments.some((dept) => !userDepartments.includes(dept))) {
        throw new Error("PMs can only create projects in their departments.");
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
          documentIds: selectedDocumentIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to add instruction.");
      }
      setInstructionText("");
      setInstructionTarget("");
      setEditingInstructionId("");
      setSelectedDocumentIds([]);
      setDocumentSearch("");
      setDocumentPickerOpen(false);
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

  const toggleFavorite = async (projectId, nextFavorite) => {
    if (!projectId) return;
    setFavoriteUpdatingId(projectId);
    setFavoriteError("");
    try {
      const res = await fetch("/api/projects/favorites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, favorite: nextFavorite }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update favorite.");
      }
      setFavoriteIds(Array.isArray(data.favoriteProjectIds) ? data.favoriteProjectIds : []);
    } catch (err) {
      setFavoriteError(err.message || "Unable to update favorite.");
    } finally {
      setFavoriteUpdatingId("");
    }
  };

  const currentAssignment = useMemo(() => {
    if (!selected || !userId) return null;
    return (selected.assignments || []).find((a) => a.userId === userId) || null;
  }, [selected, userId]);

  const availableDepartments = useMemo(() => {
    if (isPm) {
      return departments.filter((dept) => userDepartments.includes(dept.name));
    }
    return departments;
  }, [departments, isPm, userDepartments]);

  const isOwner = selected?.createdBy?.id === userId;
  const canManageSelected =
    !!selected &&
    (isAdmin ||
      (isPm &&
        Array.isArray(selected.departments) &&
        selected.departments.length > 0 &&
        selected.departments.every((dept) => userDepartments.includes(dept))));

  const canDeleteInstruction = isAdmin || (isPm && canManageSelected);

  const canEditInstruction = (insAuthorId) => {
    return isAdmin || (isPm && canManageSelected);
  };

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const favoriteProjects = useMemo(
    () => projects.filter((project) => favoriteSet.has(project._id)),
    [projects, favoriteSet],
  );
  const otherProjects = useMemo(
    () => projects.filter((project) => !favoriteSet.has(project._id)),
    [projects, favoriteSet],
  );
  const favoriteLimitReached = favoriteIds.length >= 2;
  const isSelectedFavorite = selected?._id ? favoriteSet.has(selected._id) : false;
  const selectedFavoriteDisabled =
    !!selected?._id &&
    (favoriteUpdatingId === selected._id || (favoriteLimitReached && !isSelectedFavorite));
  const isSelectedDue = selected?.dueDate ? isDue(selected.dueDate) : false;

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
                : isPm
                  ? "Manage projects for your departments."
                  : "See the projects you are assigned to."}
            </span>
          </div>
          {canManageProjects && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="rounded-full border border-emerald-300/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-50 shadow-lg shadow-emerald-500/20 transition hover:-translate-y-[1px]"
            >
              New project
            </button>
          )}
        </header>

        <section
          className={`grid gap-6 ${
            selected ? "lg:grid-cols-[0.7fr_1.3fr]" : "lg:grid-cols-[1.05fr_0.95fr]"
          }`}
        >
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/30">
            {favoriteError && (
              <div className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {favoriteError}
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}
            {!loading && favoriteProjects.length > 0 && (
              <div className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200/80">
                    Favorites
                  </h2>
                  <span className="text-xs text-amber-100/80">
                    {favoriteProjects.length} of 2
                  </span>
                </div>
                <div className="grid gap-3">
                  {favoriteProjects.map((project) => {
                    const isFavorite = favoriteSet.has(project._id);
                    const disableFavorite =
                      favoriteUpdatingId === project._id ||
                      (favoriteLimitReached && !isFavorite);
                    return (
                      <ProjectCard
                        key={project._id}
                        project={project}
                        selected={selected?._id === project._id}
                        onSelect={handleSelect}
                        canManage={canManageProjects}
                        onEdit={startEdit}
                        onDelete={deleteProject}
                        isFavorite={isFavorite}
                        disableFavorite={disableFavorite}
                        onToggleFavorite={toggleFavorite}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Latest projects</h2>
              <span className="text-xs text-slate-300">
                {loading ? "Loading..." : `${otherProjects.length} item(s)`}
              </span>
            </div>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 rounded-2xl border border-white/5 bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-5 py-10 text-center text-slate-300">
                {canManageProjects
                  ? "No projects yet. Create one to get started."
                  : "No project assigned."}
              </div>
            ) : otherProjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-5 py-6 text-center text-slate-300">
                No other projects.
              </div>
            ) : (
              <div className="grid gap-3">
                {otherProjects.map((project) => {
                  const isFavorite = favoriteSet.has(project._id);
                  const disableFavorite =
                    favoriteUpdatingId === project._id ||
                    (favoriteLimitReached && !isFavorite);
                  return (
                    <ProjectCard
                      key={project._id}
                      project={project}
                      selected={selected?._id === project._id}
                      onSelect={handleSelect}
                      canManage={canManageProjects}
                      onEdit={startEdit}
                      onDelete={deleteProject}
                      isFavorite={isFavorite}
                      disableFavorite={disableFavorite}
                      onToggleFavorite={toggleFavorite}
                    />
                  );
                })}
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
                  <FavoriteButton
                    isFavorite={isSelectedFavorite}
                    disabled={selectedFavoriteDisabled}
                    onToggle={() => toggleFavorite(selected._id, !isSelectedFavorite)}
                  />
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-emerald-100/90">
                  {selected.dueDate && (
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${
                        isSelectedDue
                          ? "border-rose-400/70 bg-rose-500/25 text-rose-100 shadow-[0_0_18px_rgba(248,113,113,0.6)]"
                          : "border-emerald-200/40 bg-emerald-950/50 text-emerald-100"
                      }`}
                    >
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
                    <h3 className="text-sm font-semibold text-white">Workers on this project</h3>
                    {canManageSelected && (
                      <button
                        type="button"
                        onClick={() => startEdit(selected)}
                        className="inline-flex items-center rounded-md border border-emerald-300/30 bg-emerald-500/10 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-emerald-50 transition hover:-translate-y-[1px] hover:border-emerald-200/60 hover:bg-emerald-500/20 cursor-pointer"
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
                                    {Array.isArray(ins.documents) && ins.documents.length > 0 && (
                                      <div className="mt-1 flex flex-wrap gap-2 text-[0.65rem] text-emerald-100/80">
                                        {ins.documents.map((docId) => {
                                          const doc = documentMap.get(docId);
                                          const label = doc?.title || doc?.originalName || "Document";
                                          const ext = getDocumentExtension(doc);
                                          return (
                                            <a
                                              key={docId}
                                              href={`/api/documents/${docId}`}
                                              className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-950/40 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.12em] text-emerald-100 transition hover:border-emerald-200/70"
                                            >
                                              <span className="max-w-[160px] truncate">{label}</span>
                                              <span className="text-emerald-200/70">
                                                {ext ? ext : "file"}
                                              </span>
                                            </a>
                                          );
                                        })}
                                      </div>
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
                                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-300/30 hover:-translate-y-[1px] cursor-pointer disabled:opacity-60 ${
                                          ins.done
                                            ? "bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25"
                                            : "bg-amber-500/15 text-amber-50 hover:bg-amber-500/25"
                                        }`}
                                      >
                                        {ins.done ? "Reopen" : "Mark done"}
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
                                          const nextDocs = Array.isArray(ins.documents)
                                            ? ins.documents
                                            : [];
                                          setSelectedDocumentIds(nextDocs);
                                          setDocumentSearch("");
                                          setDocumentPickerOpen(nextDocs.length > 0);
                                        }}
                                        className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-slate-300/30 cursor-pointer"
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
                                        className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-rose-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-rose-500/20 focus:outline-none focus:ring-2 focus:ring-rose-300/30 cursor-pointer disabled:opacity-60"
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

                {canManageSelected && (
                  <div className="rounded-xl border border-white/10 bg-emerald-900/40 p-4">
                    <h3 className="text-sm font-semibold text-white mb-2">Add assignment</h3>
                    {instructionError && (
                      <div className="mb-2 rounded border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                        {instructionError}
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3 text-xs text-emerald-50">
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            checked={instructionScope === "assignment"}
                            onChange={() => {
                              setInstructionScope("assignment");
                              setEditingInstructionId("");
                              setInstructionText("");
                              setSelectedDocumentIds([]);
                              setDocumentSearch("");
                              setDocumentPickerOpen(false);
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
                              setSelectedDocumentIds([]);
                              setDocumentSearch("");
                              setDocumentPickerOpen(false);
                            }}
                          />
                          <span>General</span>
                        </label>
                      </div>
                      {instructionScope === "assignment" && (
                        <div>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/70">
                            Choose assignee
                          </div>
                          <div
                            className="relative"
                            onBlur={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget)) {
                                setAssigneeMenuOpen(false);
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                setAssigneeMenuOpen(false);
                              }
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setAssigneeMenuOpen((prev) => !prev)}
                              className="flex w-full items-center justify-between rounded-lg border border-emerald-300/40 bg-emerald-950/60 px-3 py-2 text-sm text-emerald-50 shadow-sm transition hover:border-emerald-200/70 focus:outline-none focus:ring-2 focus:ring-emerald-300/40"
                              aria-haspopup="listbox"
                              aria-expanded={assigneeMenuOpen}
                            >
                              <span>
                                {(selected.assignments || []).find(
                                  (a) =>
                                    a.userId ===
                                    (instructionTarget || currentAssignment?.userId || ""),
                                )?.name ||
                                  (selected.assignments || []).find(
                                    (a) =>
                                      a.userId ===
                                      (instructionTarget || currentAssignment?.userId || ""),
                                  )?.email ||
                                  "Choose assignee"}
                              </span>
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                                className="h-4 w-4 text-emerald-100/70"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.23l3.71-4a.75.75 0 1 1 1.08 1.04l-4.25 4.59a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                            {assigneeMenuOpen && (
                              <div
                                role="listbox"
                                className="absolute z-10 mt-2 w-full rounded-xl border border-emerald-300/30 bg-emerald-950/95 p-1 shadow-xl shadow-black/40"
                              >
                                {(selected.assignments || []).length === 0 ? (
                                  <div className="px-3 py-2 text-xs text-emerald-100/70">
                                    No assignees yet.
                                  </div>
                                ) : (
                                  (selected.assignments || []).map((a) => {
                                    const isSelected =
                                      a.userId ===
                                      (instructionTarget || currentAssignment?.userId || "");
                                    return (
                                      <button
                                        key={a.userId}
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected}
                                        onClick={() => {
                                          setInstructionTarget(a.userId);
                                          setAssigneeMenuOpen(false);
                                        }}
                                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                                          isSelected
                                            ? "bg-emerald-500/20 text-emerald-50"
                                            : "text-emerald-100 hover:bg-emerald-500/15"
                                        }`}
                                      >
                                        <span>{a.name || a.email || "User"}</span>
                                        <span className="text-[0.7rem] text-emerald-100/60">
                                          {(a.departments || []).join(", ") || "No dept"}
                                        </span>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <textarea
                        rows={3}
                        value={instructionText}
                        onChange={(e) => setInstructionText(e.target.value)}
                        placeholder="Add an assignment..."
                        className="w-full rounded-lg border border-emerald-300/40 bg-emerald-950/60 px-3 py-2 text-sm text-emerald-50 placeholder:text-emerald-50/60 focus:border-emerald-200/70 focus:outline-none focus:ring-2 focus:ring-emerald-300/40"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setDocumentPickerOpen((prev) => !prev)}
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-950/50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100 transition hover:border-emerald-200/70"
                        >
                          {documentPickerOpen ? "Hide documents" : "Add documents"}
                        </button>
                        {selectedDocumentIds.length > 0 && (
                          <span className="text-xs text-emerald-100/80">
                            {selectedDocumentIds.length} attached
                          </span>
                        )}
                      </div>
                      {documentPickerOpen && (
                        <div className="rounded-lg border border-emerald-300/20 bg-emerald-950/40 p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <input
                              type="text"
                              value={documentSearch}
                              onChange={(e) => setDocumentSearch(e.target.value)}
                              placeholder="Search documents..."
                              className="w-full rounded-md border border-emerald-300/30 bg-emerald-950/60 px-3 py-2 text-sm text-emerald-50 placeholder:text-emerald-100/60 focus:border-emerald-200/70 focus:outline-none"
                            />
                            {selectedDocumentIds.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setSelectedDocumentIds([])}
                                className="rounded-md border border-emerald-300/30 px-2 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-emerald-100 transition hover:border-emerald-200/70"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          {documentsError && (
                            <div className="mb-2 rounded border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                              {documentsError}
                            </div>
                          )}
                          {documentsLoading ? (
                            <div className="space-y-2">
                              {Array.from({ length: 3 }).map((_, index) => (
                                <div
                                  key={index}
                                  className="h-8 rounded bg-emerald-200/10"
                                />
                              ))}
                            </div>
                          ) : visibleDocuments.length === 0 ? (
                            <div className="rounded-md border border-emerald-300/20 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-100/80">
                              {documents.length === 0
                                ? "No documents uploaded yet."
                                : "No matching documents found."}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {!documentSearch.trim() && (
                                <div className="text-[0.65rem] uppercase tracking-[0.16em] text-emerald-100/70">
                                  Recent files
                                </div>
                              )}
                              {visibleDocuments.map((doc) => {
                                const docId = doc?._id || doc?.id;
                                if (!docId) return null;
                                const ext = getDocumentExtension(doc);
                                const label = doc?.title || doc?.originalName || "Document";
                                const selected = selectedDocumentIds.includes(docId);
                                return (
                                  <button
                                    key={docId}
                                    type="button"
                                    onClick={() => toggleDocument(docId)}
                                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${
                                      selected
                                        ? "border-emerald-300/60 bg-emerald-500/15 text-emerald-50"
                                        : "border-emerald-300/20 bg-emerald-950/40 text-emerald-100 hover:border-emerald-200/60"
                                    }`}
                                  >
                                    <span className="truncate">{label}</span>
                                    <span className="text-[0.65rem] uppercase tracking-[0.16em] text-emerald-100/70">
                                      {ext ? ext : "file"}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
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
                              ? "Update assignment"
                              : "Add assignment"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {Array.isArray(selected.generalInstructions) &&
                  selected.generalInstructions.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
                      <h3 className="mb-2 text-sm font-semibold text-white">
                        General instructions
                      </h3>
                      <ul className="space-y-2 text-sm text-emerald-50/90">
                        {selected.generalInstructions.map((ins) => (
                          <li
                            key={ins._id || ins.text}
                            className="flex items-start justify-between gap-2 rounded border border-emerald-300/20 bg-emerald-500/10 px-3 py-2"
                          >
                            <div>
                              <div className="text-emerald-50">{ins.text}</div>
                              {Array.isArray(ins.documents) && ins.documents.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2 text-[0.65rem] text-emerald-100/80">
                                  {ins.documents.map((docId) => {
                                    const doc = documentMap.get(docId);
                                    const label = doc?.title || doc?.originalName || "Document";
                                    const ext = getDocumentExtension(doc);
                                    return (
                                      <a
                                        key={docId}
                                        href={`/api/documents/${docId}`}
                                        className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-950/40 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.12em] text-emerald-100 transition hover:border-emerald-200/70"
                                      >
                                        <span className="max-w-[160px] truncate">{label}</span>
                                        <span className="text-emerald-200/70">
                                          {ext ? ext : "file"}
                                        </span>
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
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
                                    const nextDocs = Array.isArray(ins.documents)
                                      ? ins.documents
                                      : [];
                                    setSelectedDocumentIds(nextDocs);
                                    setDocumentSearch("");
                                    setDocumentPickerOpen(nextDocs.length > 0);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-slate-300/30 cursor-pointer"
                                >
                                  Edit
                                </button>
                              )}
                              {canDeleteInstruction && (
                                <button
                                  type="button"
                                  onClick={() => deleteInstruction("general", ins._id)}
                                  disabled={instructionDeletingId === ins._id}
                                  className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-rose-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-rose-500/20 focus:outline-none focus:ring-2 focus:ring-rose-300/30 cursor-pointer disabled:opacity-60"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-emerald-100/80">
                Select a project to view details.
              </div>
            )}
          </div>
        </section>

        {canManageProjects && showForm && (
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
              <div className="flex items-center gap-3">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => resetForm()}
                    className="text-xs font-semibold text-emerald-100 underline"
                  >
                    Cancel edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => resetForm({ hide: true })}
                  className="text-xs font-semibold text-emerald-100 underline"
                >
                  Close
                </button>
              </div>
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
                  {availableDepartments.map((dept) => {
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
                  {isPm && availableDepartments.length === 0 && (
                    <p className="text-xs text-amber-100">
                      No departments assigned. Ask an admin to add one.
                    </p>
                  )}
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


