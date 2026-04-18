export default function BadgesLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-8 w-28 rounded-lg bg-border animate-pulse" />
        <div className="h-4 w-24 rounded bg-border animate-pulse" />
      </div>

      {/* Filter / sort / search bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-9 w-48 rounded-lg bg-border animate-pulse" />
        <div className="h-9 w-28 rounded-lg bg-border animate-pulse" />
        <div className="h-9 w-28 rounded-lg bg-border animate-pulse" />
      </div>

      {/* Badge rows */}
      <div className="mt-5 space-y-2">
        {Array.from({ length: 10 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 rounded-lg border border-border px-4 py-3"
          >
            <div className="h-4 w-8 rounded bg-border animate-pulse" />
            <div className="h-4 w-36 rounded bg-border animate-pulse" />
            <div className="h-4 flex-1 rounded bg-border animate-pulse" />
            <div className="h-4 w-16 rounded bg-border animate-pulse" />
            <div className="h-4 w-12 rounded bg-border animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
