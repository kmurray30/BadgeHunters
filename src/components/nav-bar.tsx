import Link from "next/link";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { NavUserMenu } from "./nav-user-menu";
import { BottomTabBar, TopNavLinks } from "./nav-links";
import { SITE_NAME } from "@/lib/config";

export async function NavBar() {
  const session = await auth();
  const cookieStore = await cookies();
  const isAdminMode = cookieStore.get("admin_mode")?.value === "active";

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-display text-lg font-bold uppercase tracking-wider">
              <span className="neon-text">{SITE_NAME}</span>
            </Link>
            {session?.user && <TopNavLinks />}
          </div>

          {session?.user ? (
            <NavUserMenu
              userName={session.user.name ?? "User"}
              userImage={session.user.image ?? undefined}
              isTestUser={session.user.isTestUser}
              role={session.user.role}
              isAdminMode={isAdminMode}
            />
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>
      {session?.user && <BottomTabBar />}
    </>
  );
}
