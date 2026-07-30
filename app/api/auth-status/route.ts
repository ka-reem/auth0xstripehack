import { NextResponse } from "next/server";
import { auth0Configured } from "../../../lib/auth0";

export async function GET() {
  return NextResponse.json({ enabled: auth0Configured() });
}
