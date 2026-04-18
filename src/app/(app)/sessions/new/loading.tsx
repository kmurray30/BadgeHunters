export default function NewSessionLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Back button */}
      <div className="h-4 w-20 rounded bg-border animate-pulse" />

      {/* Title */}
      <div className="mt-4 h-8 w-44 rounded-lg bg-border animate-pulse" />

      {/* Form card */}
      <div className="mt-6 rounded-xl border border-border bg-card p-5 space-y-5">
        {/* Date picker */}
        <div>
          <div className="h-4 w-20 rounded bg-border animate-pulse" />
          <div className="mt-2 h-10 w-full rounded-lg bg-border animate-pulse" />
        </div>

        {/* Members */}
        <div>
          <div className="h-4 w-28 rounded bg-border animate-pulse" />
          <div className="mt-2 h-4 w-48 rounded bg-border animate-pulse" />
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-8 w-24 rounded-full bg-border animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Ghost players */}
        <div>
          <div className="h-4 w-32 rounded bg-border animate-pulse" />
          <div className="mt-2 flex gap-2">
            <div className="h-10 flex-1 rounded-lg bg-border animate-pulse" />
            <div className="h-10 w-16 rounded-lg bg-border animate-pulse" />
          </div>
        </div>

        {/* Submit button */}
        <div className="h-11 w-full rounded-lg bg-border animate-pulse" />
      </div>
    </div>
  );
}
