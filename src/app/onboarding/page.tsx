import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { OnboardingClient } from "./onboarding-client";
import { ENABLE_EMAIL_LOOKUP } from "@/lib/config";

export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Already fully onboarded — nothing to do here
  if (session.user.onboardingComplete) {
    redirect("/badges");
  }

  // Non-pending real users who somehow land here also get bounced to badges
  if (!session.user.pendingOnboarding && session.user.id && session.user.onboardingComplete) {
    redirect("/badges");
  }

  // Read Google profile from the session (no DB query needed)
  const email = session.user.email ?? null;
  const googleName = session.user.name ?? null;

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <OnboardingClient
        email={ENABLE_EMAIL_LOOKUP ? email : null}
        googleName={googleName}
        enableEmailLookup={ENABLE_EMAIL_LOOKUP}
      />
    </div>
  );
}
