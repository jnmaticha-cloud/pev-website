const express = require('express');
const { readDb } = require('../data/store');

const router = express.Router();

// A live snapshot of PEV activity for the homepage "At a Glance" strip —
// built entirely from real data already in the system, no manual entry
// required beyond the optional Announcements collection.
router.get('/at-a-glance', (req, res) => {
  const db = readDb();
  res.json({
    openRoles: db.careers.map((c) => c.title),
    activeProjects: db.projects.map((p) => p.title),
    announcements: db.announcements
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 5)
      .map((a) => a.text),
    generatedAt: new Date().toISOString(),
  });
});

// Optional external business-news headlines. Off by default — set
// NEWS_API_KEY (a free key from https://gnews.io works) to enable it.
// Never throws: any failure just reports { configured: true, articles: [] }
// so the homepage strip quietly falls back to internal updates only.
const NEWS_TTL_MS = 10 * 60 * 1000; // cache for 10 minutes — avoid burning API quota
let newsCache = { at: 0, articles: [] };

router.get('/news/external', async (req, res) => {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    return res.json({ configured: false, articles: [] });
  }

  if (Date.now() - newsCache.at < NEWS_TTL_MS) {
    return res.json({ configured: true, articles: newsCache.articles });
  }

  try {
    // gnews.io free tier — swap the URL/parsing here if you use a
    // different provider (NewsAPI.org, Bing News, etc.).
    const url = `https://gnews.io/api/v4/search?q=business%20OR%20finance%20Kenya&lang=en&max=5&apikey=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Upstream news API returned ${response.status}`);
    const data = await response.json();
    const articles = (data.articles || []).map((a) => ({
      title: a.title,
      url: a.url,
      source: a.source && a.source.name,
      publishedAt: a.publishedAt,
    }));
    newsCache = { at: Date.now(), articles };
    res.json({ configured: true, articles });
  } catch (err) {
    console.error('[news] External news fetch failed:', err.message);
    res.json({ configured: true, articles: [] });
  }
});

module.exports = router;
