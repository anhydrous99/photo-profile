import { verifySession } from "@/infrastructure/auth";
import { redirect } from "next/navigation";

/**
 * Protected Admin Layout
 *
 * Server Component that performs full JWT verification via the DAL.
 * If session is invalid or expired, redirects to login page.
 *
 * This provides the second layer of protection after proxy.ts:
 * - proxy.ts: Checks cookie EXISTS (returns 404 if not)
 * - This layout: Verifies JWT is VALID (redirects to login if not)
 */
export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifySession();

  if (!session) {
    // Session invalid or expired - redirect to login
    redirect("/admin/login");
  }

  return <>{children}</>;
}
