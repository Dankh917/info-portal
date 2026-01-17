"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import ParticleBackground from "../particle-background";

export default function EmployeeDirectoryPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to load users.");
      }
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || "Unable to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase();
    return (
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      (user.phone && user.phone.toLowerCase().includes(query))
    );
  });

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-4xl space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-lg">
          <h1 className="text-xl font-semibold text-white">Access Restricted</h1>
          <p className="text-sm text-slate-300">Please log in to view the Employee Directory.</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-50 hover:border-emerald-200/70 hover:bg-emerald-500/25"
          >
            Log in
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-16 text-slate-100">
        <ParticleBackground />
        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="text-center">Loading employees...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-16 text-slate-100">
        <ParticleBackground />
        <div className="relative z-10 mx-auto max-w-6xl space-y-3">
          <p className="text-rose-200">{error}</p>
          <button
            type="button"
            onClick={loadUsers}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:border-emerald-300/40 hover:bg-emerald-500/10"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-16 text-slate-100">
      <ParticleBackground />
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="mb-8 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">Company</p>
            <h1 className="text-3xl font-semibold text-white">Employee Directory</h1>
            <p className="text-sm text-slate-300">Browse all employees in your company</p>
          </div>

          <div className="flex items-center">
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 placeholder-slate-400 focus:border-emerald-300/60 focus:outline-none"
            />
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="text-center text-slate-400">
            {searchQuery ? "No employees match your search." : "No employees found."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredUsers.map((user) => (
              <Link
                key={user._id}
                href={`/profile/${encodeURIComponent(user.username)}`}
                className="group flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-900/50 p-4 transition-all hover:border-emerald-300/40 hover:bg-slate-900/80 hover:shadow-lg"
              >
                <div className="relative h-20 w-20 overflow-hidden rounded-lg bg-slate-800">
                  <img
                    src={user.profileImage || user.image || "/profile-placeholder.png"}
                    alt={user.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-white">{user.name}</h3>
                      {user.role && (
                        <p className="text-xs text-slate-400 uppercase tracking-wider">
                          {user.role === "admin" && (
                            <span className="inline-block rounded-full border border-rose-300/40 bg-rose-500/10 px-2 py-0.5 text-rose-100">
                              Admin
                            </span>
                          )}
                          {user.role === "pm" && (
                            <span className="inline-block rounded-full border border-amber-300/40 bg-amber-500/10 px-2 py-0.5 text-amber-100">
                              PM
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-slate-300">
                  <p className="truncate">{user.email}</p>
                  {user.phone && <p className="font-mono text-slate-400">{user.phone}</p>}
                </div>
                {Array.isArray(user.departments) && user.departments.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {user.departments.slice(0, 2).map((dept) => (
                      <span
                        key={dept}
                        className="inline-block rounded-full border border-emerald-300/30 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-100"
                      >
                        {dept}
                      </span>
                    ))}
                    {user.departments.length > 2 && (
                      <span className="text-[0.65rem] text-slate-400">
                        +{user.departments.length - 2} more
                      </span>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8 text-center text-sm text-slate-400">
          Showing {filteredUsers.length} of {users.length} employees
        </div>
      </div>
    </div>
  );
}
