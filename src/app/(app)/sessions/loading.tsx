export default function SessionsLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-32 rounded-lg bg-border animate-pulse" />
        <div className="h-9 w-28 rounded-lg bg-border animate-pulse" />
      </div>

      {/* Active sessions section */}
      <div className="h-4 w-40 rounded bg-border animate-pulse" />
      <div className="mt-3 space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-4"
          >
            <div className="space-y-2">
              <div className="h-4 w-36 rounded bg-border animate-pulse" />
              <div className="h-3 w-24 rounded bg-border animate-pulse" />
            </div>
            <div className="h-5 w-16 rounded-full bg-border animate-pulse" />
          </div>
        ))}
      </div>

      {/* Past sessions section */}
      <div className="mt-8 h-4 w-32 rounded bg-border animate-pulse" />
      <div className="mt-3 space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-4"
          >
            <div className="space-y-2">
              <div className="h-4 w-36 rounded bg-border animate-pulse" />
              <div className="h-3 w-24 rounded bg-border animate-pulse" />
            </div>
            <div className="h-5 w-16 rounded-full bg-border animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
