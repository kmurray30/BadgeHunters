export default function PlayerDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Back button */}
      <div className="h-4 w-20 rounded bg-border animate-pulse" />

      {/* Player header card */}
      <div className="mt-4 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full bg-border animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 w-36 rounded bg-border animate-pulse" />
            <div className="h-3 w-24 rounded bg-border animate-pulse" />
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-border bg-card px-1.5 py-2.5 sm:p-4 text-center"
          >
            <div className="mx-auto h-7 w-12 rounded bg-border animate-pulse" />
            <div className="mx-auto mt-1 h-3 w-16 rounded bg-border animate-pulse" />
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-3 w-24 rounded bg-border animate-pulse" />
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-border" />

      {/* Last synced */}
      <div className="mt-3 h-3 w-36 rounded bg-border animate-pulse" />

      {/* Completed badges heading */}
      <div className="mt-6 h-4 w-40 rounded bg-border animate-pulse" />

      {/* Badge list */}
      <div className="mt-3 space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 rounded-lg border border-border px-4 py-3"
          >
            <div className="h-4 w-8 rounded bg-border animate-pulse" />
            <div className="h-4 w-36 rounded bg-border animate-pulse" />
            <div className="h-4 flex-1 rounded bg-border animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
