import { NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getActiveScoreSyncRun,
  runScoreSync,
} from "@/lib/score-sync";

export const maxDuration = 150;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeRun = await getActiveScoreSyncRun();
  if (activeRun) {
    return NextResponse.json(
      { error: "A sync is already in progress", runId: activeRun.id },
      { status: 409 },
    );
  }

  const run = await prisma.scoreSyncRun.create({
    data: {
      startedByUserId: session.user.id,
      status: "pending",
      currentLabel: "Queued…",
    },
  });

  after(async () => {
    try {
      await runScoreSync(run.id);
    } catch (syncError) {
      console.error("[sync/start] Background sync failed:", syncError);
    }
  });

  return NextResponse.json({ runId: run.id });
}
