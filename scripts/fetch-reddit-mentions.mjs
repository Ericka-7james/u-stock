// scripts/fetch-reddit-mentions.mjs
import dotenv from "dotenv";
import { writeFile } from "node:fs/promises";

import {
  REDDIT_SUBREDDITS,
  POSTS_PER_SUBREDDIT,
} from "../src/config/redditSources.js";
import {
  tallyTickerMentions,
  sortTickerCounts,
} from "../src/lib/redditMentions.js";

dotenv.config({ path: ".env.local" });

const CLIENT_ID = process.env.VITE_REDDIT_CLIENT_ID;
const SECRET = process.env.VITE_REDDIT_SECRET;
const USERNAME = process.env.VITE_REDDIT_USERNAME;
const PASSWORD = process.env.VITE_REDDIT_PASSWORD;
const USER_AGENT = process.env.VITE_REDDIT_USER_AGENT || "u-stock-app/1.0";

async function getRedditToken() {
  if (!CLIENT_ID || !SECRET || !USERNAME || !PASSWORD) {
    throw new Error("Missing one or more Reddit env vars in .env.local");
  }

  const authString = Buffer.from(`${CLIENT_ID}:${SECRET}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "password",
    username: USERNAME,
    password: PASSWORD,
  });

  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${authString}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Reddit auth error:", data);
    throw new Error(`Failed to get token: ${response.status} ${response.statusText}`);
  }

  return data.access_token;
}

async function fetchSubredditPosts(subreddit, token, limit = POSTS_PER_SUBREDDIT) {
  const url = `https://oauth.reddit.com/r/${subreddit}/new?limit=${limit}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`Error fetching /r/${subreddit}:`, data);
    throw new Error(`Failed to fetch subreddit ${subreddit}`);
  }

  const posts = data.data.children || [];
  return posts.map((p) => p.data);
}

async function main() {
  console.log("🔍 Fetching Reddit ticker mentions from:", REDDIT_SUBREDDITS.join(", "));
  console.log(`📊 Posts per subreddit: ${POSTS_PER_SUBREDDIT}`);

  const token = await getRedditToken();
  console.log("✅ Got Reddit token");

  const allPosts = [];

  for (const sub of REDDIT_SUBREDDITS) {
    console.log(`📥 Fetching /r/${sub}...`);
    const posts = await fetchSubredditPosts(sub, token);
    allPosts.push(...posts);
  }

  // Pure logic via src/lib
  const counts = tallyTickerMentions(allPosts, { trackedOnly: false });
  const sorted = sortTickerCounts(counts);

  const result = {
    generatedAt: new Date().toISOString(),
    subreddits: REDDIT_SUBREDDITS,
    postsPerSubreddit: POSTS_PER_SUBREDDIT,
    totalPosts: allPosts.length,
    mentions: sorted,
  };

  await writeFile("public/reddit-mentions.json", JSON.stringify(result, null, 2));

  console.log("✅ Saved ticker mentions to public/reddit-mentions.json");
  if (sorted.length > 0) {
    console.log("Top tickers:", sorted.slice(0, 15));
  } else {
    console.log("No tickers found this run.");
  }
}

main().catch((err) => {
  console.error("❌ Error in fetch-reddit-mentions:", err);
  process.exit(1);
});
