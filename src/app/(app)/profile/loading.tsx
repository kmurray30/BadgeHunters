export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Profile header card */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full bg-border animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 w-36 rounded bg-border animate-pulse" />
            <div className="h-3 w-28 rounded bg-border animate-pulse" />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="rounded-lg border border-border px-3 py-2 text-center"
            >
              <div className="mx-auto h-6 w-10 rounded bg-border animate-pulse" />
              <div className="mx-auto mt-1 h-3 w-14 rounded bg-border animate-pulse" />
            </div>
          ))}
        </div>

        {/* Details */}
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex justify-between">
              <div className="h-4 w-24 rounded bg-border animate-pulse" />
              <div className="h-4 w-32 rounded bg-border animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Recent completions */}
      <div className="mt-6 rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="h-5 w-40 rounded bg-border animate-pulse" />
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-4 w-8 rounded bg-border animate-pulse" />
              <div className="h-4 w-36 rounded bg-border animate-pulse" />
            </div>
            <div className="h-3 w-20 rounded bg-border animate-pulse" />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <div className="h-10 w-32 rounded-lg bg-border animate-pulse" />
        <div className="h-10 w-32 rounded-lg bg-border animate-pulse" />
      </div>
    </div>
  );
}
