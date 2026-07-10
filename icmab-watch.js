// TAAR ICMAB watcher
// The ICMAB site renders its notice board with JavaScript, so a plain RSS/
// HTML fetch (like fetch-news.js uses) won't see the content — this uses
// Puppeteer to render the page like a real browser, then diffs the notice
// list against what was seen last run and pings Telegram for anything new.

import puppeteer from "puppeteer";
import fs from "fs";

const NOTICE_URL = "https://icmab.gov.bd/student-notice-board/";
const SEEN_FILE = "icmab-seen.json";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[WARN] Telegram secrets not set, skipping notification:", text);
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
    if (!resp.ok) {
      console.error("[Telegram send failed]", resp.status, await resp.text());
    }
  } catch (err) {
    console.error("[Telegram send error]", err.message);
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
  );

  console.log("Loading", NOTICE_URL);
  await page.goto(NOTICE_URL, { waitUntil: "networkidle2", timeout: 45000 });
  await new Promise((r) => setTimeout(r, 3000));

  const items = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a"));
    const seenHrefs = new Set();
    const out = [];
    const skipExact = ["home", "about us", "contact us", "login", "sign in", "menu", "read more"];
    for (const a of anchors) {
      const text = (a.innerText || "").trim().replace(/\s+/g, " ");
      const href = a.href;
      if (!text || text.length < 15 || text.length > 300) continue;
      if (!href || seenHrefs.has(href)) continue;
      if (skipExact.includes(text.toLowerCase())) continue;
      seenHrefs.add(href);
      out.push({ title: text, link: href });
    }
    return out;
  });

  console.log(`Found ${items.length} candidate notice items.`);
  items.slice(0, 30).forEach((it, i) => console.log(`  ${i + 1}. ${it.title} — ${it.link}`));

  await browser.close();

  let seenBefore = [];
  try {
    seenBefore = JSON.parse(fs.readFileSync(SEEN_FILE, "utf8"));
  } catch {
    console.log(`No existing ${SEEN_FILE} found — treating this as the first run.`);
  }
  const seenLinks = new Set(seenBefore.map((x) => x.link));
  const isFirstRun = seenBefore.length === 0;

  const newItems = items.filter((it) => !seenLinks.has(it.link));

  if (newItems.length && !isFirstRun) {
    console.log(`${newItems.length} new item(s) — sending Telegram notifications.`);
    for (const it of newItems.slice(0, 10)) {
      await sendTelegram(`📋 ICMAB নতুন নোটিশ:\n${it.title}\n${it.link}`);
    }
  } else if (isFirstRun) {
    console.log("First run — saving baseline without sending notifications, so you don't get flooded with old notices.");
  } else {
    console.log("No new items this run.");
  }

  const updated = [...newItems, ...seenBefore].slice(0, 300);
  fs.writeFileSync(SEEN_FILE, JSON.stringify(updated, null, 2));
  console.log(`Saved ${updated.length} items to ${SEEN_FILE}.`);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
