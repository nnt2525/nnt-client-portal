"use client";

export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#161918", color: "#f3f0e9", padding: 24 }}>
    <section style={{ maxWidth: 440 }}><p>NNT / CLIENT PORTAL</p><h1>Let’s reconnect.</h1><p>The workspace could not load. Try again to return to your projects.</p><button onClick={reset}>Try again</button></section>
  </main>;
}
