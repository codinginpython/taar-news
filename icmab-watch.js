// TAAR ICMAB watcher
// The ICMAB site renders its notice board with JavaScript, so a plain RSS/
// HTML fetch (like fetch-news.js uses) won't see the content — this uses
// Puppeteer to render the page like a real browser, then diffs the notice
// list against what was seen last run and pings Telegram for anything new.

import puppeteer from "puppeteer";
import fs from "fs";

const NOTICE_URL = "https://icmab.gov.bd/notices/";
const SEEN_FILE = "icmab-seen.json";
const CATEGORIES = ["Students", "Members", "Employees", "Tenders"];
const WATCH_CATEGORIES = ["Students"];

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
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 2000));

  try {
    await page.screenshot({ path: "debug-screenshot.png", fullPage: true });
    const bodyText = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync("debug-body.txt", bodyText);
    console.log(`Debug: page title = "${await page.title()}", body text length = ${bodyText.length} chars`);

    const domChain = await page.evaluate(() => {
      const needle = "Career Mentoring Program";
      const allLeafish = Array.from(document.querySelectorAll("*")).filter(
        (el) => el.children.length === 0 && (el.textContent || "").includes(needle)
      );
      if (!allLeafish.length) return `[no element found containing "${needle}"]`;
      let el = allLeafish[0];
      const chain = [];
      for (let i = 0; i < 7 && el; i++) {
        chain.push(`----LEVEL ${i} (${el.tagName}${el.className ? "." + String(el.className).replace(/\s+/g, ".") : ""})----\n` + el.outerHTML.slice(0, 1500));
        el = el.parentElement;
      }
      return chain.join("\n\n");
    });
    fs.writeFileSync("debug-dom.txt", domChain);
  } catch (err) {
    console.error("[debug capture failed]", err.message);
  }

  const allItems = await page.evaluate((CATEGORIES) => {
    const cards = Array.from(document.querySelectorAll(".MuiCard-root"));
    const out = [];
    for (const card of cards) {
      const category = card.querySelector(".MuiChip-label")?.textContent?.trim() || "";
      if (!CATEGORIES.includes(category)) continue;
      const captions = card.querySelectorAll(".MuiTypography-caption");
      const date = captions[0]?.textContent?.trim() || "";
      const time = captions[1]?.textContent?.trim() || "";
      const title = card.querySelector("h6")?.textContent?.trim() || "";
      if (!title) continue;
      out.push({ category, date, time, title });
    }
    return out;
  }, CATEGORIES);

  const items = allItems
    .filter((it) => WATCH_CATEGORIES.includes(it.category))
    .map((it) => ({ ...it, key: `${it.category}|${it.date}|${it.title}` }));

  console.log(`Found ${allItems.length} total notice cards, ${items.length} in watched categories (${WATCH_CATEGORIES.join(", ")}).`);
  items.slice(0, 30).forEach((it, i) => console.log(`  ${i + 1}. [${it.category}] ${it.date} ${it.time} — ${it.title}`));

  await browser.close();

  let seenBefore = [];
  try {
    seenBefore = JSON.parse(fs.readFileSync(SEEN_FILE, "utf8"));
  } catch {
    console.log(`No existing ${SEEN_FILE} found — treating this as the first run.`);
  }
  const seenKeys = new Set(seenBefore.map((x) => x.key));
  const isFirstRun = seenBefore.length === 0;

  const newItems = items.filter((it) => !seenKeys.has(it.key));

  if (newItems.length && !isFirstRun) {
    console.log(`${newItems.length} new item(s) — sending Telegram notifications.`);
    for (const it of newItems.slice(0, 10)) {
      await sendTelegram(
        `📋 ICMAB নতুন নোটিশ [${it.category}, ${it.date}]:\n${it.title}\n${NOTICE_URL}`
      );
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
