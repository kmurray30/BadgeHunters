export default function PlayersLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-5">
      <div className="mb-4 h-9 w-36 animate-pulse rounded-lg bg-card" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="panel flex items-center gap-3 p-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-card-hover" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 animate-pulse rounded bg-card-hover" />
              <div className="h-2 w-2/3 animate-pulse rounded bg-card-hover" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
