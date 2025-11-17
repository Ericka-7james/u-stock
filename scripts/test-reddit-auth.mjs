// scripts/test-reddit-auth.mjs
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const CLIENT_ID = process.env.VITE_REDDIT_CLIENT_ID;
const SECRET = process.env.VITE_REDDIT_SECRET;
const USERNAME = process.env.VITE_REDDIT_USERNAME;
const PASSWORD = process.env.VITE_REDDIT_PASSWORD;
const USER_AGENT = process.env.VITE_REDDIT_USER_AGENT || "u-stock-app/1.0";

async function testRedditAuth() {
  console.log("🔍 Testing Reddit credentials...");

  if (!CLIENT_ID || !SECRET || !USERNAME || !PASSWORD) {
    console.error("❌ Missing one or more Reddit env vars in .env.local");
    console.error("Required: VITE_REDDIT_CLIENT_ID, VITE_REDDIT_SECRET, VITE_REDDIT_USERNAME, VITE_REDDIT_PASSWORD");
    process.exit(1);
  }

  const authString = Buffer.from(`${CLIENT_ID}:${SECRET}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "password",
    username: USERNAME,
    password: PASSWORD,
  });

  try {
    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Reddit auth failed");
      console.error("Status:", response.status, response.statusText);
      console.error("Response:", data);
      process.exit(1);
    }

    console.log("✅ Reddit auth successful!");
    console.log("Token type:", data.token_type);
    console.log("Expires in:", data.expires_in, "seconds");
  } catch (err) {
    console.error("❌ Error while calling Reddit:", err);
    process.exit(1);
  }
}

testRedditAuth();
