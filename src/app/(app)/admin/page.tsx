import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminClient } from "./admin-client";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const isAdminMode = cookieStore.get("admin_mode")?.value === "active";

  if (!isAdminMode) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <AdminClient />
    </div>
  );
}
