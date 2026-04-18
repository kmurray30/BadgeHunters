export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Welcome */}
      <div className="text-center mb-6">
        <div className="mx-auto h-9 w-72 rounded-lg bg-border animate-pulse" />
        <div className="mx-auto mt-2 h-4 w-56 rounded bg-border animate-pulse" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
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
      <div className="mt-4 h-3 w-20 rounded bg-border animate-pulse" />
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-border" />

      {/* Last synced */}
      <div className="mt-3 h-3 w-36 rounded bg-border animate-pulse" />

      {/* Session groups */}
      <div className="mt-6 space-y-4">
        {Array.from({ length: 2 }).map((_, groupIndex) => (
          <div key={groupIndex}>
            <div className="h-3 w-48 rounded bg-border animate-pulse" />
            <div className="mt-2 divide-y divide-border rounded-xl border border-border">
              {Array.from({ length: 2 }).map((_, rowIndex) => (
                <div
                  key={rowIndex}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="h-4 w-28 rounded bg-border animate-pulse" />
                  <div className="h-3 w-16 rounded bg-border animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
