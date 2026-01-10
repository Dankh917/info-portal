"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const friendLabel = {
  none: "Add friend",
  outgoing: "Request sent",
  incoming: "Accept request",
  friends: "Friends",
};

const statusBadge = (status) => {
  switch (status) {
    case "in_progress":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100";
    case "blocked":
      return "border-rose-300/40 bg-rose-500/15 text-rose-100";
    case "done":
      return "border-emerald-300/40 bg-emerald-500/15 text-emerald-100";
    default:
      return "border-slate-300/30 bg-slate-500/10 text-slate-100";
  }
};

const formatDate = (value) => {
  if (!value) return "No date";
  try {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
  } catch (error) {
    return "No date";
  }
};

export default function ProfileView({ username = "" }) {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [friendLoading, setFriendLoading] = useState(false);
  const isSelf = profile?.isSelf;

  const loadProfile = async () => {
    setLoading(true);
    setError("");
    try {
      const endpoint = username ? `/api/profile/${username}` : "/api/profile";
      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to load profile.");
      }
      setProfile(data.profile);
    } catch (err) {
      setError(err.message || "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const handleFriendAction = async (action, targetId) => {
    setFriendLoading(true);
    setError("");
    try {
      const res = await fetch("/api/profile/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId: targetId || profile?.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update friends.");
      }
      if (data.profile) {
        setProfile(data.profile);
      } else {
        await loadProfile();
      }
    } catch (err) {
      setError(err.message || "Unable to update friends.");
    } finally {
      setFriendLoading(false);
    }
  };

  const handleReject = async (requesterId) => {
    setFriendLoading(true);
    setError("");
    try {
      const res = await fetch("/api/profile/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", requesterId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update friends.");
      }
      await loadProfile();
    } catch (err) {
      setError(err.message || "Unable to update friends.");
    } finally {
      setFriendLoading(false);
    }
  };

  const avatar = profile?.image || "https://placehold.co/160x160/0f172a/94a3b8?text=User";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-5xl">Loading profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-5xl space-y-3">
          <p className="text-rose-200">{error}</p>
          <button
            type="button"
            onClick={loadProfile}
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
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <img
                src={avatar}
                alt={profile?.name || "User"}
                className="h-20 w-20 rounded-full border border-white/15 object-cover shadow-inner"
              />
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-white">{profile?.name}</h1>
                <p className="text-sm text-slate-300">{profile?.email}</p>
                {Array.isArray(profile?.departments) && profile.departments.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-[0.7rem] uppercase tracking-[0.18em] text-emerald-100">
                    {profile.departments.map((dept) => (
                      <span
                        key={dept}
                        className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1"
                      >
                        {dept}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {isSelf && (
              <Link
                href={profile?.username ? `/profile/${encodeURIComponent(profile.username)}/edit` : "/profile"}
                className="self-start rounded-lg border border-emerald-300/50 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-50 shadow hover:border-emerald-200/70 hover:bg-emerald-500/25"
              >
                Edit profile
              </Link>
            )}
            {!isSelf && (
              <div className="flex gap-3">
                {profile?.friendStatus === "incoming" ? (
                  <>
                    <button
                      type="button"
                      disabled={friendLoading}
                      onClick={() => handleFriendAction("accept", profile.id)}
                      className="rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-50 shadow hover:border-emerald-300/70 hover:bg-emerald-500/25"
                    >
                      Accept request
                    </button>
                    <button
                      type="button"
                      disabled={friendLoading}
                      onClick={() => handleReject(profile.id)}
                      className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:border-rose-300/50 hover:bg-rose-500/15 hover:text-rose-50"
                    >
                      Decline
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={friendLoading || profile?.friendStatus === "outgoing"}
                    onClick={() => handleFriendAction("send", profile.id)}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold shadow transition ${
                      profile?.friendStatus === "friends"
                        ? "border-emerald-300/50 bg-emerald-500/15 text-emerald-50"
                        : profile?.friendStatus === "outgoing"
                          ? "border-white/15 bg-white/5 text-slate-200"
                          : "border-emerald-300/40 bg-emerald-500/10 text-emerald-50 hover:border-emerald-200/60 hover:bg-emerald-500/20"
                    }`}
                  >
                    {friendLabel[profile?.friendStatus] || "Add friend"}
                  </button>
                )}
              </div>
            )}
          </div>
          {profile?.bio && (
            <p className="max-w-4xl text-sm leading-relaxed text-slate-200">{profile.bio}</p>
          )}
        </header>

        {profile?.assignedProjects && profile.assignedProjects.length > 0 && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Assigned projects</h2>
              <button
                type="button"
                onClick={() => router.push("/projects")}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-slate-100 hover:border-emerald-300/50 hover:bg-emerald-500/10"
              >
                View all projects
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {profile.assignedProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects?id=${project.id}`}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-emerald-300/40 hover:bg-emerald-500/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{project.title}</p>
                    <span className={`rounded-full border px-3 py-1 text-[0.7rem] uppercase tracking-[0.18em] ${statusBadge(project.status)}`}>
                      {project.status?.replaceAll("_", " ") || "planned"}
                    </span>
                  </div>
                  {project.dueDate && (
                    <p className="mt-1 text-xs text-slate-300">Due {formatDate(project.dueDate)}</p>
                  )}
                  {Array.isArray(project.departments) && project.departments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 text-[0.68rem] uppercase tracking-[0.16em] text-emerald-100">
                      {project.departments.map((dept) => (
                        <span
                          key={`${project.id}-${dept}`}
                          className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-2 py-1"
                        >
                          {dept}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-white">Friends</h2>
          {profile?.friends?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {profile.friends.map((friend) => (
                <Link
                  key={friend.id}
                  href={`/profile/${friend.username || friend.id}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-emerald-300/40 hover:bg-emerald-500/10"
                >
                  <img
                    src={friend.image || "https://placehold.co/64x64/0f172a/94a3b8?text=U"}
                    alt={friend.name}
                    className="h-10 w-10 rounded-full border border-white/15 object-cover"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">{friend.name}</p>
                    <p className="text-xs text-slate-300">{friend.email}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-300">No friends yet.</p>
          )}
        </section>

        {isSelf && profile?.incomingRequests?.length > 0 && (
          <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-white">Incoming requests</h2>
            <div className="flex flex-col gap-3">
              {profile.incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={req.image || "https://placehold.co/64x64/0f172a/94a3b8?text=U"}
                      alt={req.name}
                      className="h-10 w-10 rounded-full border border-white/15 object-cover"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">{req.name}</p>
                      <p className="text-xs text-slate-300">{req.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={friendLoading}
                      onClick={() => handleFriendAction("accept", req.id)}
                      className="rounded-lg border border-emerald-300/50 bg-emerald-500/15 px-3 py-1.5 text-[0.8rem] font-semibold text-emerald-50 hover:border-emerald-200/70 hover:bg-emerald-500/25"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={friendLoading}
                      onClick={() => handleReject(req.id)}
                      className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[0.8rem] text-slate-200 hover:border-rose-300/50 hover:bg-rose-500/15 hover:text-rose-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {isSelf && profile?.outgoingRequests?.length > 0 && (
          <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-white">Pending requests</h2>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {profile.outgoingRequests.map((req) => (
                <Link
                  key={req.id}
                  href={`/profile/${req.username || req.id}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <img
                    src={req.image || "https://placehold.co/64x64/0f172a/94a3b8?text=U"}
                    alt={req.name}
                    className="h-10 w-10 rounded-full border border-white/15 object-cover"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">{req.name}</p>
                    <p className="text-xs text-slate-300">{req.email}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
