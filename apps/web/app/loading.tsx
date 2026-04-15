export default function Loading() {
  return (
    <main className="grid gap-6">
      {[0, 1, 2].map((index) => (
        <div key={index} className="glass rounded-[28px] p-6 shadow-panel">
          <div className="animate-pulse space-y-4">
            <div className="h-4 w-32 rounded-full bg-black/10" />
            <div className="h-8 w-2/3 rounded-2xl bg-black/10" />
            <div className="grid gap-3 md:grid-cols-3">
              <div className="h-24 rounded-[22px] bg-black/10" />
              <div className="h-24 rounded-[22px] bg-black/10" />
              <div className="h-24 rounded-[22px] bg-black/10" />
            </div>
          </div>
        </div>
      ))}
    </main>
  );
}
