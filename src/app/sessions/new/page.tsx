import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { isolationFilter } from "@/lib/isolation";
import { NewSessionClient } from "./new-session-client";

export default async function NewSessionPage() {
  const user = await requireUser();
  const isolation = isolationFilter(user);

  const availableUsers = await prisma.user.findMany({
    where: { ...isolation, isActive: true, id: { not: user.id } },
    select: {
      id: true,
      activatePlayerName: true,
      realName: true,
      displayNameMode: true,
    },
    orderBy: { activatePlayerName: "asc" },
  });

  const serializedUsers = availableUsers.map((appUser) => ({
    id: appUser.id,
    displayName:
      appUser.displayNameMode === "real_name"
        ? appUser.realName ?? appUser.activatePlayerName ?? "Unknown"
        : appUser.activatePlayerName ?? appUser.realName ?? "Unknown",
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <NewSessionClient availableUsers={serializedUsers} />
    </div>
  );
}
