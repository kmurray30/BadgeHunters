import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Already fully set up → go home
  if (!session.user.pendingOnboarding) {
    redirect("/");
  }

  const googleName = session.user.name ?? null;

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <OnboardingClient googleName={googleName} />
    </div>
  );
}
