import { NextResponse } from "next/server";
import {
  createUnlockCookie,
  hasScanUnlock,
  paymentsEnabled,
  verifyCheckoutSession,
} from "../../../lib/payment";
import { ownerKeyFromRequest, readScan } from "../../../lib/scan-store";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const scanId = params.get("scan")?.trim() ?? "";
  const sessionId = params.get("session_id")?.trim() ?? "";
  if (!scanId) {
    return NextResponse.json({ error: "A scan id is required." }, { status: 400 });
  }

  const report = await readScan(scanId, ownerKeyFromRequest(request));
  if (!report) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }
  if (!paymentsEnabled()) {
    return NextResponse.json({ unlocked: true, paymentsEnabled: false });
  }
  if (!sessionId) {
    return NextResponse.json({
      unlocked: await hasScanUnlock(request, scanId),
      paymentsEnabled: true,
    });
  }

  try {
    const verified = await verifyCheckoutSession(sessionId, scanId);
    if (!verified) {
      return NextResponse.json(
        { error: "The Stripe payment could not be verified." },
        { status: 402 },
      );
    }
    const unlock = await createUnlockCookie(scanId);
    if (!unlock) {
      throw new Error("The unlock session could not be created.");
    }
    const response = NextResponse.json({
      unlocked: true,
      paymentsEnabled: true,
    });
    response.cookies.set(unlock.name, unlock.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: unlock.maxAge,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The Stripe payment could not be verified.",
      },
      { status: 502 },
    );
  }
}
