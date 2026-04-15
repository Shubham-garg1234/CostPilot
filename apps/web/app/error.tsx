"use client";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="glass rounded-[28px] p-8 shadow-panel">
      <p className="text-sm uppercase tracking-[0.2em] text-rose-700">Application Error</p>
      <h1 className="mt-4 font-display text-4xl font-semibold">This page hit an unexpected failure.</h1>
      <p className="mt-3 max-w-2xl text-slate-600">{error.message}</p>
      <button onClick={() => reset()} className="mt-6 rounded-full bg-black px-5 py-3 text-sm font-medium text-white">
        Try Again
      </button>
    </main>
  );
}
