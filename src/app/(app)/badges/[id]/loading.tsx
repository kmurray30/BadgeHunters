export default function BadgeDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Back button */}
      <div className="h-4 w-20 rounded bg-border animate-pulse" />

      {/* Badge header card */}
      <div className="mt-4 rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-3 w-12 rounded bg-border animate-pulse" />
            <div className="h-6 w-48 rounded bg-border animate-pulse" />
          </div>
          <div className="h-8 w-20 rounded-lg bg-border animate-pulse" />
        </div>
        <div className="h-4 w-full rounded bg-border animate-pulse" />
        <div className="h-4 w-3/4 rounded bg-border animate-pulse" />

        {/* Tags */}
        <div className="flex gap-2 pt-1">
          <div className="h-5 w-16 rounded-full bg-border animate-pulse" />
          <div className="h-5 w-20 rounded-full bg-border animate-pulse" />
        </div>
      </div>

      {/* Your status card */}
      <div className="mt-4 rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="h-5 w-24 rounded bg-border animate-pulse" />
        <div className="flex gap-3">
          <div className="h-9 w-28 rounded-lg bg-border animate-pulse" />
          <div className="h-9 w-28 rounded-lg bg-border animate-pulse" />
        </div>
      </div>

      {/* Completed by */}
      <div className="mt-4 rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="h-5 w-32 rounded bg-border animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-border animate-pulse" />
              <div className="h-4 w-28 rounded bg-border animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Comments */}
      <div className="mt-4 rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="h-5 w-24 rounded bg-border animate-pulse" />
        <div className="h-20 w-full rounded-lg bg-border animate-pulse" />
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="space-y-2 pt-2">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-border animate-pulse" />
              <div className="h-3 w-20 rounded bg-border animate-pulse" />
              <div className="h-3 w-16 rounded bg-border animate-pulse" />
            </div>
            <div className="h-4 w-full rounded bg-border animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
