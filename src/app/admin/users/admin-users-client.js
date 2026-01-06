"use client";

import { useEffect, useMemo, useState } from "react";

const ROLE_OPTIONS = ["user", "admin"];

export default function AdminUsersClient() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState({});
  const [filters, setFilters] = useState({ query: "" });
  const [departments, setDepartments] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [departmentsError, setDepartmentsError] = useState("");

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("/api/admin/users", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Unable to load users.");
        }

        const normalizeDepartments = (value) => {
          if (Array.isArray(value)) {
            return value
              .map((d) => d?.trim?.())
              .filter(Boolean);
          }
          if (typeof value === "string") {
            return value
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean);
          }
          return [];
        };

        const withDepartments = (data.users ?? []).map((u) => ({
          ...u,
          departments: normalizeDepartments(u.departments ?? u.department),
        }));

        setUsers(withDepartments);
      } catch (err) {
        setError(err.message || "Unable to load users.");
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, []);

  useEffect(() => {
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

    loadDepartments();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    if (!query) {
      return users;
    }
    return users.filter((user) => {
      const email = user.email?.toLowerCase() || "";
      const name = user.name?.toLowerCase() || "";
      const department = (user.departments || [])
        .join(" ")
        .toLowerCase();
      return (
        email.includes(query) ||
        name.includes(query) ||
        department.includes(query)
      );
    });
  }, [filters.query, users]);

  const updateUser = async (user, nextRole, nextDepartments) => {
    setSaving((prev) => ({ ...prev, [user._id]: true }));
    setError("");

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user._id,
          role: nextRole,
          departments: nextDepartments,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update user.");
      }

      setUsers((prev) =>
        prev.map((item) =>
          item._id === user._id
            ? { ...item, role: nextRole, departments: nextDepartments }
            : item,
        ),
      );
    } catch (err) {
      setError(err.message || "Unable to update user.");
    } finally {
      setSaving((prev) => ({ ...prev, [user._id]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">
            Admin
          </p>
          <h1 className="text-3xl font-semibold sm:text-4xl">User access</h1>
          <p className="text-sm text-slate-300">
            Assign roles and departments for team members.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/30 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex w-full flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 sm:max-w-xs">
              Search
              <input
                type="text"
                value={filters.query}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, query: event.target.value }))
                }
                placeholder="Email, name, or department"
                className="rounded-xl border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-300/50 focus:outline-none"
              />
            </label>
            <div className="text-xs text-slate-400">
              {loading ? "Loading users..." : `${filteredUsers.length} users`}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-16 rounded-2xl border border-white/5 bg-white/5"
                />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-300">
              No users found.
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredUsers.map((user) => (
                <article
                  key={user._id}
                  className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-inner shadow-black/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    {user.image ? (
                      <img
                        src={user.image}
                        alt={user.email || "User"}
                        className="h-10 w-10 rounded-full border border-white/20 object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/20 text-xs font-semibold text-emerald-100">
                        {(user.email || "U").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        {user.name || user.email || "Unknown user"}
                      </p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Role
                      <select
                        value={user.role || "user"}
                        onChange={(event) =>
                          updateUser(user, event.target.value, user.departments || [])
                        }
                        className="min-w-[120px] rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-300/50 focus:outline-none"
                        disabled={saving[user._id]}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Departments
                      <div className="flex flex-wrap gap-2">
                        {departments.map((dept) => {
                          const selected = user.departments?.includes(dept.name);
                          return (
                            <button
                              key={dept._id || dept.name}
                              type="button"
                              onClick={() => {
                                const next = selected
                                  ? (user.departments || []).filter((d) => d !== dept.name)
                                  : [...(user.departments || []), dept.name];
                                setUsers((prev) =>
                                  prev.map((item) =>
                                    item._id === user._id ? { ...item, departments: next } : item,
                                  ),
                                );
                                updateUser(user, user.role || "user", next);
                              }}
                              disabled={saving[user._id] || departmentsLoading}
                              className={`rounded-full border px-3 py-1 text-[0.78rem] font-semibold uppercase tracking-[0.12em] transition ${
                                selected
                                  ? "border-emerald-300/60 bg-emerald-500/20 text-emerald-100"
                                  : "border-white/15 bg-slate-900/80 text-slate-100 hover:border-emerald-200/40"
                              }`}
                            >
                              {dept.name}
                            </button>
                          );
                        })}
                        {!departmentsLoading && departments.length === 0 && (
                          <span className="text-xs text-amber-200/80">No departments configured.</span>
                        )}
                      </div>
                      {departmentsLoading && (
                        <span className="text-[0.75rem] text-slate-400">Loading departments…</span>
                      )}
                      {departmentsError && (
                        <span className="text-[0.7rem] text-amber-200/80">{departmentsError}</span>
                      )}
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
