"use client";

import { useEffect } from "react";

// Stripe redirects here after a successful $5 unlock payment.
// We set a local flag and bounce back to the report the user came from.
export default function UnlockedPage() {
  useEffect(() => {
    try {
      window.localStorage.setItem("clippolice_unlocked", "1");
    } catch {
      // ignore storage errors
    }
    const returnTo =
      window.localStorage.getItem("clippolice_return_to") || "/";
    const target = returnTo.includes("?")
      ? `${returnTo}&unlocked=1`
      : `${returnTo}?unlocked=1`;
    const timer = window.setTimeout(() => {
      window.location.replace(target);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        gap: 12,
        background: "#0a0a0a",
        color: "#fff",
      }}
    >
      <h1 style={{ fontSize: 28 }}>Payment confirmed ✅</h1>
      <p style={{ opacity: 0.7 }}>Unlocking your full results…</p>
    </main>
  );
}
