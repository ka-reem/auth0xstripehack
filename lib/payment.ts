import type { ScanResponse } from "./scan-contract";
import { runtimeSecret } from "./scan-store";

const UNLOCK_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

type StripeCheckoutSession = {
  id: string;
  url?: string | null;
  status?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string>;
  error?: {
    message?: string;
  };
};

function stripeSecret() {
  return runtimeSecret("STRIPE_SECRET_KEY") || runtimeSecret("STRIPE_API_KEY");
}

export function paymentsEnabled() {
  return Boolean(stripeSecret());
}

function cookieName(scanId: string) {
  return `relay_unlock_${scanId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18)}`;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function signingKey() {
  const secret = stripeSecret();
  if (!secret) return null;
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(value: string) {
  const key = await signingKey();
  if (!key) return null;
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifySignature(value: string, signature: string) {
  const key = await signingKey();
  const signatureBytes = base64UrlToBytes(signature);
  if (!key || !signatureBytes) return false;
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(value),
  );
}

export async function createUnlockCookie(scanId: string) {
  const expires = Math.floor(Date.now() / 1000) + UNLOCK_SECONDS;
  const payload = `${scanId}.${expires}`;
  const signature = await sign(payload);
  if (!signature) return null;
  return {
    name: cookieName(scanId),
    value: `${payload}.${signature}`,
    maxAge: UNLOCK_SECONDS,
  };
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const entry of cookie.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

export async function hasScanUnlock(request: Request, scanId: string) {
  if (!paymentsEnabled()) return true;
  const token = cookieValue(request, cookieName(scanId));
  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expiry = Number(payload.slice(payload.lastIndexOf(".") + 1));
  if (!payload.startsWith(`${scanId}.`) || !Number.isFinite(expiry)) return false;
  if (expiry < Math.floor(Date.now() / 1000)) return false;

  return verifySignature(payload, signature);
}

async function stripeRequest(
  path: string,
  init: Omit<RequestInit, "headers"> & { body?: URLSearchParams } = {},
) {
  const secret = stripeSecret();
  if (!secret) {
    throw new Error("Stripe checkout is not configured.");
  }

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init.body
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: init.body?.toString(),
  });
  const payload = (await response.json()) as StripeCheckoutSession;
  if (!response.ok) {
    throw new Error(
      payload.error?.message || `Stripe returned ${response.status}.`,
    );
  }
  return payload;
}

export async function createCheckoutSession(
  scanId: string,
  requestOrigin: string,
) {
  const configuredOrigin = runtimeSecret("APP_BASE_URL");
  const origin = (configuredOrigin || requestOrigin).replace(/\/+$/, "");
  const successUrl = new URL("/unlocked", origin);
  successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  successUrl.searchParams.set("scan", scanId);
  const cancelUrl = new URL("/results", origin);
  cancelUrl.searchParams.set("scan", scanId);

  const body = new URLSearchParams({
    mode: "payment",
    client_reference_id: scanId,
    "metadata[scan_id]": scanId,
    success_url: successUrl.toString(),
    cancel_url: cancelUrl.toString(),
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": "500",
    "line_items[0][price_data][product_data][name]":
      "Relay evidence report unlock",
    "line_items[0][quantity]": "1",
  });
  const session = await stripeRequest("/checkout/sessions", {
    method: "POST",
    body,
  });
  if (!session.id || !session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }
  return { id: session.id, url: session.url };
}

export async function verifyCheckoutSession(
  sessionId: string,
  scanId: string,
) {
  if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) return false;
  const session = await stripeRequest(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
  return (
    session.status === "complete" &&
    session.payment_status === "paid" &&
    session.amount_total === 500 &&
    session.currency === "usd" &&
    session.client_reference_id === scanId &&
    session.metadata?.scan_id === scanId
  );
}

export async function presentReport(
  report: ScanResponse,
  request: Request,
): Promise<ScanResponse> {
  const enabled = paymentsEnabled();
  const candidateCount = report.matches.length;
  const unlocked =
    !enabled || !candidateCount || (await hasScanUnlock(request, report.scanId));

  return {
    ...report,
    matches: unlocked ? report.matches : [],
    payment: {
      enabled,
      unlocked,
      candidateCount,
    },
  };
}
