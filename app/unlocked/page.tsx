"use client";

import { useEffect, useState } from "react";

export default function UnlockedPage() {
  const [message, setMessage] = useState("Verifying your Stripe payment…");

  useEffect(() => {
    let cancelled = false;

    async function verifyPayment() {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id")?.trim() ?? "";
      const scanId = params.get("scan")?.trim() ?? "";
      if (!sessionId || !scanId) {
        setMessage("This payment return link is incomplete.");
        return;
      }

      try {
        const query = new URLSearchParams({
          session_id: sessionId,
          scan: scanId,
        });
        const response = await fetch(`/api/unlock?${query.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          unlocked?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.unlocked) {
          throw new Error(payload.error || "The payment could not be verified.");
        }
        if (!cancelled) {
          window.location.replace(
            `/results?scan=${encodeURIComponent(scanId)}`,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "The payment could not be verified.",
          );
        }
      }
    }

    void verifyPayment();
    return () => {
      cancelled = true;
    };
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
        padding: 32,
        textAlign: "center",
        background: "#0a0a0a",
        color: "#fff",
      }}
    >
      <span style={{ fontSize: 14, letterSpacing: "0.18em", opacity: 0.62 }}>
        SECURE CHECKOUT
      </span>
      <h1 style={{ fontSize: 34, margin: 0 }}>Confirming access</h1>
      <p style={{ opacity: 0.72, fontSize: 18, margin: 0 }}>{message}</p>
    </main>
  );
}
