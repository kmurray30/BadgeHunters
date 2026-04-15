import { cookies } from "next/headers";
import { AdminClient } from "./admin-client";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const isAdminMode = cookieStore.get("admin_mode")?.value === "active";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <AdminClient initialAdminMode={isAdminMode} />
    </div>
  );
}
