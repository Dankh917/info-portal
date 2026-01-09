"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function UserMenu() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      console.log("[UserMenu] User authenticated", {
        email: session?.user?.email,
        role: session?.user?.role,
      });
    } else if (status === "unauthenticated") {
      console.log("[UserMenu] User unauthenticated");
    }
  }, [status, session?.user?.email, session?.user?.role]);

  const email = session?.user?.email;
  const displayName = email || "Sign in";
  const initials = (email || "S").slice(0, 2).toUpperCase();

  if (pathname === "/login") {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="fixed right-3 top-3 z-[60] flex items-center sm:right-6 sm:top-5"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs text-slate-100 backdrop-blur transition hover:border-white/30"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {session?.user?.image && !imageError ? (
          <img
            src={session.user.image}
            alt={email || "User avatar"}
            className="h-7 w-7 rounded-full border border-white/20 object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/20 text-[0.6rem] font-semibold text-emerald-100">
            {initials}
          </span>
        )}
        <span className="max-w-[110px] truncate text-[0.7rem] text-slate-200 sm:max-w-[160px]">
          {displayName}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 min-w-[180px] rounded-2xl border border-white/10 bg-slate-900/95 p-2 text-xs text-slate-100 shadow-xl backdrop-blur"
        >
          <div className="px-3 py-2 text-[0.7rem] text-slate-400">
            {status === "loading"
              ? "Loading..."
              : email || "Sign in with Google"}
          </div>
          <div className="h-px bg-white/10" />
          {session?.user?.role === "admin" && (
            <a
              href="/admin/users"
              className="mt-1 block rounded-xl px-3 py-2 text-[0.75rem] text-slate-100 transition hover:bg-white/10"
              role="menuitem"
            >
              Manage users
            </a>
          )}
          {session ? (
            <button
              type="button"
              onClick={() => {
                console.log("[UserMenu] Signing out user", { email: session.user.email });
                signOut({ callbackUrl: "/login" });
              }}
              className="mt-1 w-full rounded-xl px-3 py-2 text-left text-[0.75rem] text-slate-100 transition hover:bg-white/10"
              role="menuitem"
            >
              Sign out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                console.log("[UserMenu] Initiating Google sign in");
                signIn("google", { callbackUrl: "/", prompt: "select_account" });
              }}
              className="mt-1 w-full rounded-xl px-3 py-2 text-left text-[0.75rem] text-slate-100 transition hover:bg-white/10"
              role="menuitem"
            >
              Sign in
            </button>
          )}
        </div>
      )}
    </div>
  );
}
