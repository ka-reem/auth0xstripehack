import { auth0 } from "../lib/auth0";
import Scanner from "./scanner";

export default async function Home() {
  const session = await auth0.getSession();

  if (!session) {
    return (
      <main>
        <h1>RepostRadar</h1>
        <p>Find stolen / reposted copies of your short-form videos.</p>
        <a
          href="/auth/login"
          style={{
            display: "inline-block",
            padding: "10px 18px",
            background: "#000",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Log in
        </a>
      </main>
    );
  }

  return (
    <main>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1>RepostRadar</h1>
        <div style={{ fontSize: 14 }}>
          {session.user.email}{" "}
          <a href="/auth/logout" style={{ marginLeft: 8 }}>
            Log out
          </a>
        </div>
      </div>
      <p>Paste your original video URL to find reposts.</p>
      <Scanner />
    </main>
  );
}
