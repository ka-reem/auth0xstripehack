import { NextResponse } from "next/server";
import { createCheckoutSession, paymentsEnabled } from "../../../lib/payment";
import { ownerKeyFromRequest, readScan } from "../../../lib/scan-store";

export async function POST(request: Request) {
  if (!paymentsEnabled()) {
    return NextResponse.json(
      { error: "Stripe checkout is not configured." },
      { status: 503 },
    );
  }

  let body: { scanId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const scanId = typeof body.scanId === "string" ? body.scanId.trim() : "";
  if (!scanId) {
    return NextResponse.json({ error: "A scan id is required." }, { status: 400 });
  }

  const report = await readScan(scanId, ownerKeyFromRequest(request));
  if (!report) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }
  if (report.status !== "completed" || !report.matches.length) {
    return NextResponse.json(
      { error: "This scan has no completed candidates to unlock." },
      { status: 409 },
    );
  }

  try {
    const checkout = await createCheckoutSession(
      scanId,
      new URL(request.url).origin,
    );
    return NextResponse.json(checkout);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Stripe Checkout could not be started.",
      },
      { status: 502 },
    );
  }
}
