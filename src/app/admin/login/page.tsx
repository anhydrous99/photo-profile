"use client";

import { useActionState } from "react";
import { login, LoginState } from "@/app/actions/auth";

/**
 * Login page for admin authentication
 *
 * Minimal centered form per user decision:
 * - Password field only (no username - single admin)
 * - No logo or header - let simplicity speak
 * - Inline error messages for validation and rate limiting
 */
export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form action={action} className="w-full max-w-sm space-y-4 px-4">
        <input
          type="password"
          name="password"
          placeholder="Password"
          disabled={pending}
          className="w-full rounded border px-4 py-2 disabled:opacity-50"
          autoFocus
        />

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        {state.rateLimited && (
          <p className="text-sm text-red-600">
            Too many attempts. Try again in {state.retryAfter} seconds.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
        >
          {pending ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
