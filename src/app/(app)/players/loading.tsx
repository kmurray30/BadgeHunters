export default function PlayersLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 h-8 w-28 rounded-lg bg-border animate-pulse" />

      <div className="rounded-lg border border-border">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_5rem_5rem_5rem] items-center gap-4 border-b border-border bg-card px-4 py-2">
          <div className="h-3 w-12 rounded bg-border animate-pulse" />
          <div className="mx-auto h-3 w-10 rounded bg-border animate-pulse" />
          <div className="mx-auto h-3 w-10 rounded bg-border animate-pulse" />
          <div className="mx-auto h-3 w-12 rounded bg-border animate-pulse" />
        </div>

        {/* Player rows */}
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-[2fr_5rem_5rem_5rem] items-center gap-4 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-border animate-pulse" />
                <div className="space-y-1.5">
                  <div className="h-4 w-28 rounded bg-border animate-pulse" />
                  <div className="h-2.5 w-20 rounded bg-border animate-pulse" />
                </div>
              </div>
              <div className="mx-auto h-4 w-10 rounded bg-border animate-pulse" />
              <div className="mx-auto h-4 w-12 rounded bg-border animate-pulse" />
              <div className="space-y-1">
                <div className="mx-auto h-4 w-10 rounded bg-border animate-pulse" />
                <div className="h-1 overflow-hidden rounded-full bg-border" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
