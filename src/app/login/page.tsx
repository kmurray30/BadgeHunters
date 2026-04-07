import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginClient } from "./login-client";
import { cookies } from "next/headers";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/badges");
  }

  const cookieStore = await cookies();
  const isAdminMode = cookieStore.get("admin_mode")?.value === "active";

  return <LoginClient initialAdminMode={isAdminMode} />;
}
