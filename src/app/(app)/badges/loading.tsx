export default function BadgesLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-5">
      <div className="mb-3 h-9 w-40 animate-pulse rounded-lg bg-card" />
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-9 w-24 animate-pulse rounded-full bg-card" />
        ))}
      </div>
      <div className="mb-3 h-10 animate-pulse rounded-xl bg-card" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="panel flex gap-3 p-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-card-hover" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/5 animate-pulse rounded bg-card-hover" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-card-hover" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
