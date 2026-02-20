"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import ParticleBackground from "../particle-background";

const GOOGLE_AUTH_PARAMS = {
  prompt: "consent select_account",
  access_type: "offline",
  scope:
    "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
};

export default function LoginPage() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const requestedCallback = searchParams.get("callbackUrl");
  const callbackUrl = requestedCallback?.startsWith("/") ? requestedCallback : "/";
  const authError = searchParams.get("error");

  const errorMessage = (() => {
    if (!authError) return null;
    switch (authError) {
      case "AccessDenied":
        return "Access denied by Google. Make sure this account is added as an approved test user.";
      case "OAuthSignin":
      case "OAuthCallback":
      case "OAuthCreateAccount":
      case "Callback":
        return "Google sign-in could not be completed. Try again in an incognito window.";
      case "Configuration":
        return "Auth configuration error. Verify NEXTAUTH_URL, NEXTAUTH_SECRET, and Google OAuth settings.";
      default:
        return `Sign-in failed: ${authError}`;
    }
  })();

  useEffect(() => {
    if (status === "authenticated") {
      window.location.assign(callbackUrl);
    }
  }, [callbackUrl, status]);

  const isLoading = status === "loading";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <ParticleBackground />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16 text-center">
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
            signIn("google", { callbackUrl }, GOOGLE_AUTH_PARAMS)
          }
          className="inline-flex items-center justify-center gap-3 rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:scale-[1.01] hover:bg-emerald-300 disabled:scale-100 disabled:cursor-not-allowed disabled:bg-emerald-400/50"
        >
          {isLoading ? "Loading..." : "Continue with Google"}
        </button>
        {errorMessage && (
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {errorMessage}
          </p>
        )}
        {session?.user?.email && (
          <p className="text-xs text-slate-400">
            Signed in as {session.user.email}
          </p>
        )}
      </main>
    </div>
  );
}
