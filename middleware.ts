import type { NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

// Mounts Auth0 routes: /auth/login, /auth/logout, /auth/callback
export async function middleware(request: NextRequest) {
  return await auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
