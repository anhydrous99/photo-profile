import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { decrypt } from "./session";

/**
 * Verify session from cookie
 * Uses React cache() to deduplicate calls within a single request
 * Returns auth state or null if not authenticated
 */
export const verifySession = cache(
  async (): Promise<{ isAuth: true } | null> => {
    const cookieStore = await cookies();
    const session = cookieStore.get("session")?.value;

    if (!session) {
      return null;
    }

    const payload = await decrypt(session);
    if (!payload) {
      return null;
    }

    return { isAuth: true };
  },
);
