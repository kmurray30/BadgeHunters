export default function SessionDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Back button */}
      <div className="h-4 w-20 rounded bg-border animate-pulse" />

      {/* Session header card */}
      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 rounded bg-border animate-pulse" />
            <div className="h-4 w-32 rounded bg-border animate-pulse" />
          </div>
          <div className="h-6 w-16 rounded-full bg-border animate-pulse" />
        </div>
        {/* Members row */}
        <div className="mt-4 flex gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-8 w-8 rounded-full bg-border animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="mt-6 flex gap-4 border-b border-border pb-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-5 w-24 rounded bg-border animate-pulse"
          />
        ))}
      </div>

      {/* Filter / sort bar */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-8 w-28 rounded-lg bg-border animate-pulse" />
        <div className="h-8 w-28 rounded-lg bg-border animate-pulse" />
      </div>

      {/* Badge table rows */}
      <div className="mt-4 space-y-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 rounded-lg border border-border px-4 py-3"
          >
            <div className="h-4 w-8 rounded bg-border animate-pulse" />
            <div className="h-4 w-32 rounded bg-border animate-pulse" />
            <div className="h-4 flex-1 rounded bg-border animate-pulse" />
            <div className="h-4 w-12 rounded bg-border animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
