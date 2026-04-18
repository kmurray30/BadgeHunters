export default function FeedbackLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Title */}
      <div className="h-8 w-32 rounded-lg bg-border animate-pulse" />

      {/* New feedback form */}
      <div className="mt-4 rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="h-5 w-36 rounded bg-border animate-pulse" />
        <div className="h-24 w-full rounded-lg bg-border animate-pulse" />
        <div className="flex justify-end">
          <div className="h-9 w-24 rounded-lg bg-border animate-pulse" />
        </div>
      </div>

      {/* Existing feedback posts */}
      <div className="mt-6 space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-border bg-card p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-border animate-pulse" />
              <div className="h-3 w-24 rounded bg-border animate-pulse" />
              <div className="h-3 w-16 rounded bg-border animate-pulse" />
            </div>
            <div className="h-4 w-full rounded bg-border animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-border animate-pulse" />
            <div className="flex gap-2 pt-1">
              {Array.from({ length: 3 }).map((_, reactionIndex) => (
                <div
                  key={reactionIndex}
                  className="h-6 w-10 rounded-full bg-border animate-pulse"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
