// TAAR spider — fetches RSS feeds, tags articles by topic, writes news.json
// Runs server-side (Node) via GitHub Actions, so no CORS/browser restrictions apply.

import Parser from "rss-parser";
import fs from "fs";

const parser = new Parser({ timeout: 15000 });

// ---- Topics (single word / short label) --------------------------------
const TOPICS = [
  { en: "Economy/Business", bn: "অর্থনীতি ও ব্যবসা", key: ["economy", "economic", "business", "market", "অর্থনীতি", "ব্যবসা"] },
  { en: "Politics", bn: "রাজনীতি", key: ["politics", "political", "election", "রাজনীতি"] },
  { en: "CNG/Fuel", bn: "সিএনজি/জ্বালানি", key: ["cng", "fuel", "gas price", "সিএনজি", "জ্বালানি"] },
  { en: "Technology", bn: "প্রযুক্তি", key: ["technology", " tech ", "প্রযুক্তি"] },
  { en: "Computer Science", bn: "কম্পিউটার সায়েন্স", key: ["computer science", "algorithm", "software", "programming", "ai model", "machine learning"] },
  { en: "Physics", bn: "পদার্থবিজ্ঞান", key: ["physics", "quantum", "particle", "পদার্থবিজ্ঞান"] },
  { en: "Mathematics", bn: "গণিত", key: ["mathematic", "math ", "proof", "গণিত"] },
  { en: "Statistics", bn: "পরিসংখ্যান", key: ["statistic", "পরিসংখ্যান"] },
  { en: "Science", bn: "বিজ্ঞান", key: ["science", "research", "study finds", "বিজ্ঞান"] },
  { en: "Medicine", bn: "চিকিৎসাবিজ্ঞান", key: ["medicine", "medical", "health", "disease", "vaccine", "স্বাস্থ্য"] },
  { en: "History", bn: "ইতিহাস", key: ["history", "historical", "ancient", "ইতিহাস"] },
  { en: "Philosophy", bn: "দর্শন", key: ["philosophy", "philosopher", "দর্শন"] },
  { en: "Literature", bn: "সাহিত্য", key: ["literature", "literary", "novel", "poet", "সাহিত্য"] },
  { en: "New Book Releases", bn: "নতুন বই", key: ["new book", "book review", "publishes", "release", "বই"] },
  { en: "Fine Arts/Culture", bn: "চারুকলা ও সংস্কৃতি", key: ["art exhibit", "museum", "culture", "painting", "সংস্কৃতি", "শিল্প"] },
  { en: "Football", bn: "ফুটবল", key: ["football", "soccer", "ফুটবল"] },
  { en: "Tennis", bn: "টেনিস", key: ["tennis", "টেনিস"] },
  { en: "Chess", bn: "দাবা", key: ["chess", "দাবা"] },
  { en: "ICMAB/Accounting", bn: "হিসাববিজ্ঞান", key: ["accounting", "audit", "icmab", "ifrs", "cost management", "হিসাববিজ্ঞান"] },
];

const FEEDS = [
  { name: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml", region: "global" },
  { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", region: "global", primary: ["Economy/Business"] },
  { name: "BBC Football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", region: "global", primary: ["Football"] },
  { name: "BBC Tennis", url: "https://feeds.bbci.co.uk/sport/tennis/rss.xml", region: "global", primary: ["Tennis"] },
  { name: "The Guardian World", url: "https://www.theguardian.com/world/rss", region: "global" },
  { name: "The Guardian Politics", url: "https://www.theguardian.com/politics/rss", region: "global", primary: ["Politics"] },
  { name: "The Guardian Business", url: "https://www.theguardian.com/uk/business/rss", region: "global", primary: ["Economy/Business"] },
  { name: "The Guardian Books", url: "https://www.theguardian.com/books/rss", region: "global", primary: ["New Book Releases", "Literature"] },
  { name: "The Guardian Football", url: "https://www.theguardian.com/football/rss", region: "global", primary: ["Football"] },
  { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", region: "global" },
  { name: "NYT Books", url: "https://rss.nytimes.com/services/xml/rss/nyt/Books.xml", region: "global", primary: ["New Book Releases", "Literature"] },
  { name: "NYT Science", url: "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml", region: "global", primary: ["Science"] },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", region: "global" },
  { name: "NPR", url: "https://feeds.npr.org/1001/rss.xml", region: "global" },
  { name: "DW", url: "https://rss.dw.com/rdf/rss-en-all", region: "global" },
  { name: "Quanta Magazine", url: "https://api.quantamagazine.org/feed/", region: "global", primary: ["Science"] },
  { name: "Science News", url: "https://www.sciencenews.org/feed", region: "global", primary: ["Science"] },
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/", region: "global", primary: ["Technology", "Computer Science"] },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", region: "global", primary: ["Technology", "Computer Science"] },
  { name: "Physics World", url: "https://physicsworld.com/feed/", region: "global", primary: ["Physics"] },
  { name: "STAT News", url: "https://www.statnews.com/feed/", region: "global", primary: ["Medicine"] },
  { name: "Smithsonian History", url: "https://www.smithsonianmag.com/rss/history/", region: "global", primary: ["History"] },
  { name: "Aeon", url: "https://aeon.co/feed.rss", region: "global", primary: ["Philosophy"] },
  { name: "LitHub", url: "https://lithub.com/feed/", region: "global", primary: ["Literature", "New Book Releases"] },
  { name: "Chess.com News", url: "https://www.chess.com/rss/news", region: "global", primary: ["Chess"] },
  { name: "The Daily Star", url: "https://www.thedailystar.net/frontpage/rss.xml", region: "bd" },
  { name: "bdnews24", url: "https://bdnews24.com/?widgetName=rssfeed&widgetId=1150&getXmlFeed=true", region: "bd" },
  { name: "প্রথম আলো", url: "https://www.prothomalo.com/feed/", region: "bd" },
  { name: "যুগান্তর", url: "https://www.jugantor.com/feed/rss.xml", region: "bd" },
  { name: "কালের কণ্ঠ", url: "https://www.kalerkantho.com/rss.xml", region: "bd" },
  { name: "বাংলা ট্রিবিউন", url: "https://www.banglatribune.com/feed", region: "bd" },
];

const EDITORIAL_FEEDS = [
  { name: "NYT Opinion", url: "https://rss.nytimes.com/services/xml/rss/nyt/Opinion.xml" },
  { name: "The Guardian Opinion", url: "https://www.theguardian.com/commentisfree/rss" },
  { name: "The Economist", url: "https://www.economist.com/international/rss.xml" },
  { name: "Foreign Policy", url: "https://foreignpolicy.com/feed/" },
  { name: "The Atlantic", url: "https://www.theatlantic.com/feed/all/" },
  { name: "Project Syndicate", url: "https://www.project-syndicate.org/rss" },
  { name: "The Daily Star Opinion", url: "https://www.thedailystar.net/opinion/rss.xml" },
];

function tagTopics(title, summary, primary) {
  const hay = `${title} ${summary}`.toLowerCase();
  const keywordHits = TOPICS.filter((t) => t.key.some((k) => hay.includes(k.toLowerCase()))).map((t) => t.en);
  return Array.from(new Set([...(primary || []), ...keywordHits]));
}

function dedupKey(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s\u0980-\u09FF]/g, "")
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");
}

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items || []).slice(0, 20).map((it) => {
      const title = (it.title || "").trim();
      const summary = (it.contentSnippet || it.summary || "").trim().slice(0, 260);
      return {
        title,
        summary,
        link: it.link || "",
        pubDate: it.isoDate || it.pubDate || "",
        source: feed.name,
        region: feed.region,
        topics: tagTopics(title, summary, feed.primary),
      };
    });
  } catch (err) {
    console.error(`[FAIL] ${feed.name}: ${err.message}`);
    return [];
  }
}

async function fetchEditorial(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items || []).slice(0, 5).map((it) => ({
      title: (it.title || "").trim(),
      link: it.link || "",
      pubDate: it.isoDate || it.pubDate || "",
      source: feed.name,
    }));
  } catch (err) {
    console.error(`[FAIL editorial] ${feed.name}: ${err.message}`);
    return [];
  }
}

function dedupArticles(articles) {
  const groups = new Map();
  for (const a of articles) {
    const k = dedupKey(a.title);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  const merged = [];
  for (const group of groups.values()) {
    group.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    const primary = group[0];
    const otherSources = [...new Set(group.slice(1).map((g) => g.source))];
    const allTopics = Array.from(new Set(group.flatMap((g) => g.topics)));
    merged.push({ ...primary, topics: allTopics, otherSources });
  }
  return merged;
}

async function main() {
  console.log("Fetching", FEEDS.length, "feeds...");
  const articleLists = await Promise.all(FEEDS.map(fetchFeed));
  const rawArticles = articleLists.flat();
  const articles = dedupArticles(rawArticles).sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  console.log("Fetching editorial feeds...");
  const editorialLists = await Promise.all(EDITORIAL_FEEDS.map(fetchEditorial));
  const editorial = editorialLists
    .flat()
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 12);

  const output = {
    generatedAt: new Date().toISOString(),
    topics: TOPICS.map((t) => ({ en: t.en, bn: t.bn })),
    articles,
    editorial,
  };

  fs.writeFileSync("news.json", JSON.stringify(output, null, 2));
  console.log(`Wrote news.json — ${articles.length} articles (from ${rawArticles.length} raw), ${editorial.length} editorial picks.`);
}

main();