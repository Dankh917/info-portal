"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";

export default function LoginPage() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "authenticated") {
      window.location.assign("/");
    }
  }, [status]);

  const isLoading = status === "loading";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">
          InfoPortal
        </p>
        <h1 className="text-3xl font-semibold sm:text-4xl">
          Sign in to continue
        </h1>
        <p className="text-sm text-slate-300">
          Use your Google account to access company updates and tools.
        </p>
        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            signIn("google", { callbackUrl: "/", prompt: "select_account" })
          }
          className="inline-flex items-center justify-center gap-3 rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:scale-[1.01] hover:bg-emerald-300 disabled:scale-100 disabled:cursor-not-allowed disabled:bg-emerald-400/50"
        >
          {isLoading ? "Loading..." : "Continue with Google"}
        </button>
        {session?.user?.email && (
          <p className="text-xs text-slate-400">
            Signed in as {session.user.email}
          </p>
        )}
      </main>
    </div>
  );
}
