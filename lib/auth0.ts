import { Auth0Client } from "@auth0/nextjs-auth0/server";

const requiredVariables = [
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_SECRET",
] as const;

let auth0Client: Auth0Client | null = null;

export function auth0Configured() {
  return requiredVariables.every((name) => process.env[name]?.trim());
}

export function getAuth0Client() {
  if (!auth0Configured()) return null;
  auth0Client ??= new Auth0Client();
  return auth0Client;
}
