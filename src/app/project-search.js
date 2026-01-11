"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

const formatDate = (value) => {
  if (!value) return "No date";
  try {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return "No date";
  }
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightMatch = (text, query) => {
  if (!text || !query) return text;
  const safeQuery = escapeRegExp(query.trim());
  if (!safeQuery) return text;
  const regex = new RegExp(`(${safeQuery})`, "gi");
  const parts = String(text).split(regex);
  return parts.map((part, index) =>
    regex.test(part) ? (
      <span key={`${part}-${index}`} className="text-emerald-300">
        {part}
      </span>
    ) : (
      part
    ),
  );
};

// Custom debounce hook for search optimization
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function ProjectSearch() {
  const { data: session } = useSession();
  const [projects, setProjects] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favoriteError, setFavoriteError] = useState("");
  const [favoriteUpdatingId, setFavoriteUpdatingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300); // 300ms debounce

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");

      try {
        console.log("[ProjectSearch] Starting data load for user:", session?.user?.email);
        
        // Load projects, updates, documents, and users in parallel
        const [projectsRes, updatesRes, documentsRes, usersRes] = await Promise.all([
          fetch("/api/projects", { cache: "no-store" }),
          fetch("/api/updates", { cache: "no-store" }),
          fetch("/api/documents", { cache: "no-store" }),
          fetch("/api/users", { cache: "no-store" }),
        ]);

        const projectsData = await projectsRes.json();
        const updatesData = await updatesRes.json();
        const documentsData = await documentsRes.json();
        const usersData = await usersRes.json();

        if (!projectsRes.ok) {
          const errorMsg = projectsData?.error || "Unable to load projects.";
          console.error("[ProjectSearch] Failed to load projects:", {
            status: projectsRes.status,
            statusText: projectsRes.statusText,
            error: errorMsg,
            responseData: projectsData,
          });
          throw new Error(errorMsg);
        }

        if (!updatesRes.ok) {
          const errorMsg = updatesData?.error || "Unable to load updates.";
          console.error("[ProjectSearch] Failed to load updates:", {
            status: updatesRes.status,
            statusText: updatesRes.statusText,
            error: errorMsg,
            responseData: updatesData,
          });
          throw new Error(errorMsg);
        }

        if (!documentsRes.ok) {
          const errorMsg = documentsData?.error || "Unable to load documents.";
          console.error("[ProjectSearch] Failed to load documents:", {
            status: documentsRes.status,
            statusText: documentsRes.statusText,
            error: errorMsg,
            responseData: documentsData,
          });
          throw new Error(errorMsg);
        }

        if (!usersRes.ok) {
          console.error("[ProjectSearch] Failed to load users:", {
            status: usersRes.status,
            statusText: usersRes.statusText,
            error: usersData?.error || "Unable to load users.",
          });
          // Don't throw error for users, just set empty array
          setUsers([]);
        } else {
          setUsers(usersData.users ?? []);
        }

        console.log("[ProjectSearch] Successfully loaded data:", {
          projectsCount: projectsData.projects?.length || 0,
          updatesCount: updatesData.updates?.length || 0,
          documentsCount: documentsData.documents?.length || 0,
          usersCount: usersData.users?.length || 0,
          userEmail: session?.user?.email,
        });
        setFavoriteIds(
          Array.isArray(projectsData.favoriteProjectIds)
            ? projectsData.favoriteProjectIds
            : [],
        );
        setProjects(projectsData.projects ?? []);
        setUpdates(updatesData.updates ?? []);
        setDocuments(documentsData.documents ?? []);
      } catch (err) {
        const errorMsg = err.message || "Unable to load data.";
        console.error("[ProjectSearch] Error loading data:", {
          error: errorMsg,
          errorName: err.name,
          stack: err.stack,
          userEmail: session?.user?.email,
        });
        setError(errorMsg);
        setProjects([]);
        setUpdates([]);
        setDocuments([]);
        setUsers([]);
        setFavoriteIds([]);
      } finally {
        setLoading(false);
      }
    };

    if (session?.user) {
      loadData();
    } else {
      console.log("[ProjectSearch] No user session available, skipping data load");
    }
  }, [session?.user]);

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

  // Filter projects and updates based on debounced search query with useMemo for performance
  const filteredProjects = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return [];
    }

    try {
      console.log("[ProjectSearch] Filtering projects for query:", debouncedSearchQuery);
      const query = debouncedSearchQuery.toLowerCase();
      const filtered = projects.filter((project) => {
        try {
          const titleMatch = (project.title || "").toLowerCase().includes(query);
          const summaryMatch = (project.summary || "").toLowerCase().includes(query);
          const tagsMatch = Array.isArray(project.tags) &&
            project.tags.some((tag) => (tag || "").toLowerCase().includes(query));
          const deptsMatch = Array.isArray(project.departments) &&
            project.departments.some((dept) => (dept || "").toLowerCase().includes(query));
          const assignments = Array.isArray(project.assignments) ? project.assignments : [];
          const isAdmin = session?.user?.role === "admin";
          const instructions = isAdmin
            ? assignments.flatMap((item) =>
                Array.isArray(item?.instructions) ? item.instructions : [],
              )
            : session?.user?.id
              ? (assignments.find((item) => item.userId === session.user.id)?.instructions || [])
              : [];
          const instructionMatch = instructions.some((ins) =>
            (ins?.text || "").toLowerCase().includes(query),
          );

          return titleMatch || summaryMatch || tagsMatch || deptsMatch || instructionMatch;
        } catch (err) {
          console.error("[ProjectSearch] Error filtering individual project:", {
            projectId: project._id,
            error: err.message,
          });
          return false;
        }
      });

      console.log("[ProjectSearch] Filtered projects:", { query: debouncedSearchQuery, count: filtered.length });
      return filtered;
    } catch (err) {
      console.error("[ProjectSearch] Error in project filtering:", {
        query: debouncedSearchQuery,
        error: err.message,
        stack: err.stack,
      });
      return [];
    }
  }, [debouncedSearchQuery, projects, session?.user?.id, session?.user?.role]);

  const filteredUpdates = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return [];
    }

    try {
      console.log("[ProjectSearch] Filtering updates for query:", debouncedSearchQuery);
      const query = debouncedSearchQuery.toLowerCase();
      const filtered = updates.filter((update) => {
        try {
          const titleMatch = (update.title || "").toLowerCase().includes(query);
          const messageMatch = (update.message || "").toLowerCase().includes(query);

          return titleMatch || messageMatch;
        } catch (err) {
          console.error("[ProjectSearch] Error filtering individual update:", {
            updateId: update._id,
            error: err.message,
          });
          return false;
        }
      });

      console.log("[ProjectSearch] Filtered updates:", { query: debouncedSearchQuery, count: filtered.length });
      return filtered;
    } catch (err) {
      console.error("[ProjectSearch] Error in update filtering:", {
        query: debouncedSearchQuery,
        error: err.message,
        stack: err.stack,
      });
      return [];
    }
  }, [debouncedSearchQuery, updates]);

  const filteredDocuments = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return [];
    }

    try {
      console.log("[ProjectSearch] Filtering documents for query:", debouncedSearchQuery);
      const query = debouncedSearchQuery.toLowerCase();
      const filtered = documents.filter((document) => {
        try {
          const titleMatch = (document.title || "").toLowerCase().includes(query);
          const nameMatch = (document.originalName || "").toLowerCase().includes(query);
          const uploaderMatch = (document.uploadedByUsername || "").toLowerCase().includes(query);
          const uploaderNameMatch = (document.uploadedByName || "").toLowerCase().includes(query);

          return titleMatch || nameMatch || uploaderMatch || uploaderNameMatch;
        } catch (err) {
          console.error("[ProjectSearch] Error filtering individual document:", {
            documentId: document._id,
            error: err.message,
          });
          return false;
        }
      });

      console.log("[ProjectSearch] Filtered documents:", { query: debouncedSearchQuery, count: filtered.length });
      return filtered;
    } catch (err) {
      console.error("[ProjectSearch] Error in document filtering:", {
        query: debouncedSearchQuery,
        error: err.message,
        stack: err.stack,
      });
      return [];
    }
  }, [debouncedSearchQuery, documents]);

  const filteredUsers = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return [];
    }

    try {
      const query = debouncedSearchQuery.toLowerCase();
      const filtered = users.filter((user) => {
        try {
          const emailMatch = (user.email || "").toLowerCase().includes(query);
          return emailMatch;
        } catch (err) {
          return false;
        }
      });

      return filtered.slice(0, 10); // Limit to 10 users
    } catch (err) {
      return [];
    }
  }, [debouncedSearchQuery, users]);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const favoriteLimitReached = favoriteIds.length >= 2;

  const totalResults = filteredProjects.length + filteredUpdates.length + filteredDocuments.length + filteredUsers.length;

  // Track if user is actively typing
  const isSearching = searchQuery !== debouncedSearchQuery;

  if (!session?.user) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/30 backdrop-blur">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">
            Search Hub
          </p>
          <h2 className="text-2xl font-semibold">Search everything</h2>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:border-emerald-300/50 hover:text-emerald-50"
        >
          View All
        </Link>
      </div>

      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search projects, updates, documents, and users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 pr-24 text-sm text-white placeholder:text-slate-400 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 transition"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"></div>
            </div>
          )}
          {!isSearching && searchQuery.trim() && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              {totalResults} {totalResults === 1 ? 'result' : 'results'}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}
      {favoriteError && (
        <div className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {favoriteError}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse rounded-lg border border-white/5 bg-white/5 px-4 py-3"
            >
              <div className="mb-2 h-3 w-48 rounded bg-white/20" />
              <div className="h-3 w-96 rounded bg-white/15" />
            </div>
          ))}
        </div>
      )}

      {!loading && searchQuery.trim() && totalResults === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-white/5 px-5 py-8 text-center text-slate-300">
          <p className="text-sm">No results match your search.</p>
          <p className="text-xs text-slate-400 mt-1">Try a different keyword.</p>
        </div>
      ) : null}

      {!loading && searchQuery.trim() && totalResults > 0 ? (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {/* Users Section */}
          {filteredUsers.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-[0.2em] text-emerald-300/60 px-2">
                Users ({filteredUsers.length})
              </h3>
              {filteredUsers.map((user) => (
                <Link
                  key={user._id}
                  href={
                    user.email
                      ? `/profile/${encodeURIComponent(user.email)}`
                      : user.username
                        ? `/profile/${encodeURIComponent(user.username)}`
                        : `/profile`
                  }
                  className="group block rounded-lg border border-white/10 bg-slate-900/70 p-4 shadow-inner hover:border-emerald-400/30 transition"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={user.image || "https://placehold.co/40x40/0f172a/94a3b8?text=U"}
                      alt={user.name || "User"}
                      className="h-10 w-10 rounded-full border border-white/15 object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-white group-hover:text-emerald-100 transition line-clamp-1">
                        {highlightMatch(
                          user.name || user.email || "User",
                          debouncedSearchQuery,
                        )}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-1">
                        @{user.username || "user"}
                      </p>
                      {user.email && (
                        <p className="text-xs text-slate-500 line-clamp-1">
                          {highlightMatch(user.email, debouncedSearchQuery)}
                        </p>
                      )}
                      {user.bio && (
                        <p className="text-xs text-slate-500 line-clamp-1 mt-1">
                          {user.bio}
                        </p>
                      )}
                    </div>
                  </div>
                  {Array.isArray(user.departments) && user.departments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {user.departments.slice(0, 3).map((dept) => (
                        <span
                          key={dept}
                          className="inline-flex items-center rounded-full border border-white/15 bg-slate-800/60 px-2 py-0.5 text-[0.65rem] font-semibold uppercase text-slate-100"
                        >
                          {dept}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}

          {/* Updates Section */}
          {filteredUpdates.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-[0.2em] text-emerald-300/60 px-2">
                Updates ({filteredUpdates.length})
              </h3>
              {filteredUpdates.map((update) => (
                <div
                  key={update._id}
                  className="rounded-lg border border-white/10 bg-slate-900/70 p-4 shadow-inner hover:border-emerald-400/30 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-white line-clamp-1">
                        {highlightMatch(update.title, debouncedSearchQuery)}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                        {highlightMatch(update.message, debouncedSearchQuery)}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(update.createdAt)}
                    </span>
                  </div>
                  {Array.isArray(update.departments) && update.departments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {update.departments.map((dept) => (
                        <span
                          key={dept}
                          className="inline-flex items-center rounded-full border border-emerald-200/30 bg-emerald-900/60 px-2 py-0.5 text-[0.65rem] font-semibold uppercase text-emerald-100"
                        >
                          {dept}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Documents Section */}
          {filteredDocuments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-[0.2em] text-emerald-300/60 px-2">
                Documents ({filteredDocuments.length})
              </h3>
              {filteredDocuments.map((document) => (
                <a
                  key={document._id}
                  href={`/api/documents/${document._id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-lg border border-white/10 bg-slate-900/70 p-4 shadow-inner hover:border-emerald-400/30 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-white group-hover:text-emerald-100 transition line-clamp-1">
                        {highlightMatch(document.title, debouncedSearchQuery)}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-1 mt-1">
                        {document.originalName}
                      </p>
                      {document.uploadedByUsername && (
                        <p className="text-xs text-slate-500 mt-1">
                          by{" "}
                          <Link
                            href={`/profile/${encodeURIComponent(document.uploadedByUsername)}`}
                            className="text-emerald-300 hover:text-emerald-200 transition"
                            onClick={(e) => e.stopPropagation()}
                          >
                            @{document.uploadedByUsername}
                          </Link>
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(document.createdAt)}
                    </span>
                  </div>
                  {document.size && (
                    <div className="mt-2">
                      <span className="inline-flex items-center rounded-full border border-blue-200/30 bg-blue-900/60 px-2 py-0.5 text-[0.65rem] font-semibold uppercase text-blue-100">
                        {(document.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}

          {/* Projects Section */}
          {filteredProjects.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-[0.2em] text-emerald-300/60 px-2">
                Projects ({filteredProjects.length})
              </h3>
              {filteredProjects.map((project) => {
                const isFavorite = favoriteSet.has(project._id);
                const disableFavorite =
                  favoriteUpdatingId === project._id ||
                  (favoriteLimitReached && !isFavorite);
                const favoriteLabel = isFavorite ? "Unfavorite project" : "Favorite project";
                const favoriteTitle =
                  disableFavorite && !isFavorite ? "Favorite limit reached" : favoriteLabel;
                const query = debouncedSearchQuery.trim().toLowerCase();
                const assignments = Array.isArray(project.assignments) ? project.assignments : [];
                const isAdmin = session?.user?.role === "admin";
                const instructions = isAdmin
                  ? assignments.flatMap((item) =>
                      Array.isArray(item?.instructions) ? item.instructions : [],
                    )
                  : session?.user?.id
                    ? (assignments.find((item) => item.userId === session.user.id)?.instructions || [])
                    : [];
                const matchedInstructions = query
                  ? instructions.filter((ins) =>
                      (ins?.text || "").toLowerCase().includes(query),
                    )
                  : [];
                return (
                  <Link
                    key={project._id}
                    href={`/projects?id=${project._id}`}
                    className="group block rounded-lg border border-white/10 bg-slate-900/70 p-4 transition hover:border-emerald-400/40 hover:bg-slate-900/90 hover:shadow-lg hover:shadow-emerald-500/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white group-hover:text-emerald-100 transition line-clamp-1">
                          {highlightMatch(project.title, debouncedSearchQuery)}
                        </h3>
                        <p className="text-xs text-slate-400 line-clamp-1 mt-1">
                          {project.summary || "No summary"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(project.dueDate)}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleFavorite(project._id, !isFavorite);
                          }}
                          disabled={disableFavorite}
                          aria-pressed={isFavorite}
                          aria-label={favoriteLabel}
                          title={favoriteTitle}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[0.7rem] transition ${
                            isFavorite
                              ? "border-amber-300/70 bg-amber-400/20 text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                              : "border-white/15 bg-white/5 text-slate-300 hover:border-amber-300/60 hover:text-amber-100"
                          } ${disableFavorite && !isFavorite ? "cursor-not-allowed opacity-40 hover:border-white/15 hover:text-slate-300" : ""}`}
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
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isFavorite && (
                        <span className="inline-flex items-center rounded-full border border-amber-300/50 bg-amber-400/10 px-2 py-1 text-[0.65rem] font-semibold uppercase text-amber-100">
                          Favorite
                        </span>
                      )}
                      {matchedInstructions.length > 0 && (
                        <span className="inline-flex items-center rounded-full border border-emerald-200/30 bg-emerald-900/60 px-2 py-1 text-[0.65rem] font-semibold uppercase text-emerald-100">
                          Tasks: {matchedInstructions.length}
                        </span>
                      )}
                      {Array.isArray(project.departments) &&
                        project.departments.map((dept) => (
                          <span
                            key={dept}
                            className="inline-flex items-center rounded-full border border-white/15 bg-slate-800/60 px-2 py-1 text-[0.65rem] font-semibold uppercase text-slate-100"
                          >
                            {dept}
                          </span>
                        ))}
                      {Array.isArray(project.tags) &&
                        project.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-950/40 px-2 py-1 text-[0.65rem] font-semibold uppercase text-emerald-100"
                          >
                            {tag}
                          </span>
                        ))}
                      {Array.isArray(project.tags) && project.tags.length > 2 && (
                        <span className="inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-950/40 px-2 py-1 text-[0.65rem] font-semibold uppercase text-emerald-100">
                          +{project.tags.length - 2}
                        </span>
                      )}
                    </div>
                    {matchedInstructions.length > 0 && (
                      <div className="mt-3 rounded-lg border border-emerald-200/20 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-50/90">
                        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-emerald-200/80">
                          Matching tasks
                        </div>
                        <ul className="mt-2 space-y-1">
                          {matchedInstructions.slice(0, 3).map((ins) => {
                            const insKey = ins._id || ins.id || ins.text;
                            return (
                              <li
                                key={insKey}
                                className="flex items-start gap-2 rounded bg-emerald-500/10 px-2 py-1"
                              >
                                <span className="text-emerald-200/80">•</span>
                                <span className={ins.done ? "line-through text-emerald-200/70" : ""}>
                                  {ins.text}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
