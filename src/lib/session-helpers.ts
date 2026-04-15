import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Get the current authenticated user from the session, with full DB record.
 * Redirects to /login if not authenticated.
 */
export async function requireUser() {
  const session = await auth();

  // Pending users (mid-onboarding, no DB row yet) go to onboarding
  if (session?.user?.pendingOnboarding) {
    redirect("/onboarding");
  }

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    redirect("/login");
  }

  // Real users who haven't finished onboarding go back to finish it
  if (!user.onboardingComplete && !user.isTestUser) {
    redirect("/onboarding");
  }

  return user;
}

/**
 * Get the current user if logged in, or null if not.
 */
export async function getOptionalUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  return prisma.user.findUnique({
    where: { id: session.user.id },
  });
}

/**
 * Check if the current user is a superuser.
 */
export async function requireSuperuser() {
  const user = await requireUser();
  if (user.role !== "superuser") {
    redirect("/");
  }
  return user;
}
