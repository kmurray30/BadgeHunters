import Link from "next/link";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { NavUserMenu } from "./nav-user-menu";

export async function NavBar() {
  const session = await auth();
  const cookieStore = await cookies();
  const isAdminMode = cookieStore.get("admin_mode")?.value === "active";

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-foreground hover:text-accent transition-colors"
          >
            Badge Hunters
          </Link>
          {session?.user && (
            <>
              <Link
                href="/badges"
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                Badges
              </Link>
              <Link
                href="/sessions"
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                Sessions
              </Link>
              <Link
                href="/feedback"
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                Feedback
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isAdminMode && (
            <span className="rounded-full bg-warning/20 px-3 py-1 text-xs font-semibold text-warning">
              ADMIN MODE
            </span>
          )}
          {session?.user ? (
            <NavUserMenu
              userName={session.user.name ?? "User"}
              userImage={session.user.image ?? undefined}
              isTestUser={session.user.isTestUser}
              role={session.user.role}
            />
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
