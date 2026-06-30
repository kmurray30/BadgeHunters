import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  cancelScoreSyncRun,
  getActiveScoreSyncRun,
} from "@/lib/score-sync";
import { toSyncRunStatus } from "@/lib/score-sync-run";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let runId = request.nextUrl.searchParams.get("runId");

  if (!runId) {
    try {
      const body = await request.json();
      runId = typeof body.runId === "string" ? body.runId : null;
    } catch {
      runId = null;
    }
  }

  if (!runId) {
    const activeRun = await getActiveScoreSyncRun();
    runId = activeRun?.id ?? null;
  }

  if (!runId) {
    return NextResponse.json({ error: "No active sync to cancel" }, { status: 404 });
  }

  const cancelled = await cancelScoreSyncRun(runId);
  if (!cancelled) {
    return NextResponse.json(
      { error: "Sync is not running or was already finished" },
      { status: 409 },
    );
  }

  const run = await prisma.scoreSyncRun.findUnique({ where: { id: runId } });

  return NextResponse.json({
    success: true,
    runId,
    run: run ? toSyncRunStatus(run) : null,
  });
}
