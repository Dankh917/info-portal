"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { use } from "react";
import ParticleBackground from "../../../particle-background";

export default function EditProfilePage({ params }) {
  const resolvedParams = use(params);
  const usernameParam = resolvedParams?.username || "";
  const router = useRouter();
  const { update: updateSession } = useSession();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: "", bio: "" });
  const [picture, setPicture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadProfile = async () => {
    setLoading(true);
    setError("");
    try {
      const endpoint = usernameParam ? `/api/profile/${usernameParam}` : "/api/profile";
      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to load profile.");
      }
      setProfile(data.profile);
      setForm({ name: data.profile?.name || "", bio: data.profile?.bio || "" });
    } catch (err) {
      setError(err.message || "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usernameParam]);

  const handleSave = async () => {
    if (!profile?.isSelf) return;
    setSaving(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("name", form.name || "");
      formData.append("bio", form.bio || "");
      if (picture) {
        formData.append("picture", picture);
      }

      const res = await fetch("/api/profile", {
        method: "PATCH",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to save profile.");
      }
      setProfile(data.profile);
      setForm({ name: data.profile?.name || "", bio: data.profile?.bio || "" });
      if (updateSession) {
        await updateSession({ name: data.profile?.name, image: data.profile?.image });
      }
      setPicture(null);
      const nextUsername = data.profile?.username || usernameParam || "";
      if (nextUsername) {
        router.push(`/profile/${encodeURIComponent(nextUsername)}`);
      }
    } catch (err) {
      setError(err.message || "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const avatar = picture
    ? URL.createObjectURL(picture)
    : profile?.image || "https://placehold.co/160x160/0f172a/94a3b8?text=User";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-4xl">Loading profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-4xl space-y-3">
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

  if (!profile?.isSelf) {
    const viewHref = profile?.username
      ? `/profile/${encodeURIComponent(profile.username)}`
      : "/profile";
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-lg">
          <h1 className="text-xl font-semibold text-white">Editing is restricted</h1>
          <p className="text-sm text-slate-300">
            You can only edit your own profile. You are viewing another user's profile.
          </p>
          <Link
            href={viewHref}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-50 hover:border-emerald-200/70 hover:bg-emerald-500/25"
          >
            Go to profile
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">Profile</p>
            <h1 className="text-2xl font-semibold text-white">Edit profile</h1>
            <p className="text-sm text-slate-300">Changes apply to your public profile.</p>
          </div>
          <Link
            href={profile?.username ? `/profile/${encodeURIComponent(profile.username)}` : "/profile"}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:border-emerald-300/50 hover:bg-emerald-500/10"
          >
            Back to profile
          </Link>
        </div>

        <section className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-lg md:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm text-slate-300">
              Name
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 focus:border-emerald-300/60 focus:outline-none"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Bio
              <textarea
                value={form.bio}
                onChange={(event) => setForm((f) => ({ ...f, bio: event.target.value }))}
                rows={4}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 focus:border-emerald-300/60 focus:outline-none"
                placeholder="Share a short intro about yourself"
              />
            </label>
            <div className="space-y-2 text-sm text-slate-300">
              <p>Profile picture (PNG)</p>
              <button
                type="button"
                onClick={openFilePicker}
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-slate-100 transition hover:border-emerald-300/50 hover:bg-emerald-500/10"
              >
                <img
                  src={avatar}
                  alt="Current avatar"
                  className="h-12 w-12 rounded-full border border-white/15 object-cover"
                />
                <span className="text-[0.85rem] text-emerald-50 group-hover:text-emerald-100">
                  Click to choose a new PNG
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png"
                onChange={(event) => setPicture(event.target.files?.[0] || null)}
                className="hidden"
              />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-lg border border-emerald-300/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-50 shadow hover:-translate-y-[1px] hover:border-emerald-200/60 hover:bg-emerald-500/20 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            {error && <p className="text-sm text-rose-200">{error}</p>}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Preview</h3>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <img
                src={avatar}
                alt="Preview"
                className="h-16 w-16 rounded-full border border-white/15 object-cover"
              />
              <div>
                <p className="text-sm font-semibold text-white">{form.name || profile?.name}</p>
                <p className="text-xs text-slate-300">{profile?.email}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Uploading a new PNG replaces the previous picture. We store only one picture per user.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
