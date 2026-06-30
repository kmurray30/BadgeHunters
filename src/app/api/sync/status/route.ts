import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ScoreSyncErrorDetail } from "@/lib/score-sync";

function parseErrorDetails(value: unknown): ScoreSyncErrorDetail[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ScoreSyncErrorDetail =>
      typeof entry === "object" &&
      entry != null &&
      typeof (entry as ScoreSyncErrorDetail).context === "string" &&
      typeof (entry as ScoreSyncErrorDetail).message === "string",
  );
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const run = await prisma.scoreSyncRun.findUnique({ where: { id: runId } });
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const percent =
    run.totalSteps > 0
      ? Math.round((run.completedSteps / run.totalSteps) * 100)
      : 0;

  return NextResponse.json({
    id: run.id,
    status: run.status,
    completedSteps: run.completedSteps,
    totalSteps: run.totalSteps,
    currentLabel: run.currentLabel,
    percent,
    errorMessage: run.errorMessage,
    errorDetails: parseErrorDetails(run.errorDetails),
    syncedCount: run.syncedCount,
    notFoundCount: run.notFoundCount,
    errorCount: run.errorCount,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  });
}
