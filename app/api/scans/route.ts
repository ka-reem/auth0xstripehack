import { NextResponse } from "next/server";
import {
  listScans,
  ownerKeyFromRequest,
} from "../../../lib/scan-store";

export async function GET(request: Request) {
  const ownerKey = ownerKeyFromRequest(request);
  const scans = await listScans(ownerKey);
  return NextResponse.json({ scans });
}
