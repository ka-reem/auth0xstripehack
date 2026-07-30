import { NextResponse } from "next/server";
import { auth0 } from "../../../lib/auth0";

// STUB: returns fake matches so we can see the flow.
// Later: OpenRouter query-gen -> YouTube search -> vision verify.
export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { url } = await req.json();
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const matches = [
    {
      title: "Sam Altman on startups (REPOST)",
      url: "https://youtube.com/watch?v=fake1",
      platform: "YouTube",
      views: 214000,
      confidence: 92,
    },
    {
      title: "sam altman advice 🔥",
      url: "https://tiktok.com/@repost/video/fake2",
      platform: "TikTok",
      views: 88000,
      confidence: 81,
    },
    {
      title: "YC startup school clip",
      url: "https://instagram.com/reel/fake3",
      platform: "Instagram",
      views: 45000,
      confidence: 74,
    },
  ];

  return NextResponse.json({ query: url, matches });
}
