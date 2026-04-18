import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginClient } from "./login-client";

export default async function LoginPage() {
  const session = await auth();

  // Pending user (no DB account yet) → finish onboarding
  if (session?.user?.pendingOnboarding) {
    redirect("/onboarding");
  }

  // Fully authenticated user → go to home
  if (session?.user?.id) {
    redirect("/");
  }

  return <LoginClient />;
}
