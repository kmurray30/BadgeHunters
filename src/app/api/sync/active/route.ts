import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveScoreSyncRun } from "@/lib/score-sync";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeRun = await getActiveScoreSyncRun();
  if (!activeRun) {
    return NextResponse.json({ activeRun: null });
  }

  const percent =
    activeRun.totalSteps > 0
      ? Math.round((activeRun.completedSteps / activeRun.totalSteps) * 100)
      : 0;

  return NextResponse.json({
    activeRun: {
      id: activeRun.id,
      status: activeRun.status,
      completedSteps: activeRun.completedSteps,
      totalSteps: activeRun.totalSteps,
      currentLabel: activeRun.currentLabel,
      percent,
      startedAt: activeRun.startedAt.toISOString(),
    },
  });
}
