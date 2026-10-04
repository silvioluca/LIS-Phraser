const cheerio = require('cheerio');

const BASE = 'https://spreadthesign.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
};

const cache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 30;

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.time > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(key, value) {
  cache.set(key, { value, time: Date.now() });
}

async function searchWords(query) {
  const cacheKey = `search:${query}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${BASE}/it.it/search/?q=${encodeURIComponent(query)}&cls=2`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Ricerca fallita (${res.status})`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const results = [];
  $('.search-result').each((_, el) => {
    const $el = $(el);
    const id = ($el.attr('id') || '').replace('result-', '');
    const link = $el.find('.search-result-title a');
    const href = link.attr('href');
    if (!href || !id) return;
    const category = link.find('small').text().trim();
    const title = link.clone().children('small').remove().end().text().trim();
    const match = href.match(/^\/it\.it\/word\/(\d+)\/([^/]+)\/(\d+)\//);
    if (!match) return;
    results.push({
      id,
      slug: match[2],
      lang: match[3],
      path: `/it.it/word/${match[1]}/${match[2]}/${match[3]}/`,
      title,
      category
    });
  });

  setCached(cacheKey, results);
  return results;
}

function isValidWordPath(path) {
  return /^\/it\.it\/word\/\d+\/[a-z0-9-]+\/\d+\/$/i.test(path);
}

function extractSign(html, path) {
  const $ = cheerio.load(html);
  const video = $('video.js-enforce-speed').first();
  const videoUrl = video.attr('src') || video.find('source').first().attr('src');
  const poster = video.attr('poster');
  const title = $('h2').first().text().trim();
  if (!videoUrl) return null;
  return { path, title, videoUrl, poster: poster || null };
}

async function fetchSignHtml(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Recupero segno fallito (${res.status})`);
  return res.text();
}

async function getSign(path) {
  if (!isValidWordPath(path)) {
    throw new Error('Percorso non valido');
  }

  const cacheKey = `sign:${path}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  let result = extractSign(await fetchSignHtml(path), path);

  if (!result) {
    // Pagina a volte arriva senza video (hiccup transitorio del sito sorgente): un ritentativo basta quasi sempre.
    await new Promise((r) => setTimeout(r, 400));
    result = extractSign(await fetchSignHtml(path), path);
  }

  if (!result) {
    console.error(`[scraper] video non trovato dopo retry: ${path}`);
    throw new Error('Video non trovato per questo segno');
  }

  setCached(cacheKey, result);
  return result;
}

module.exports = { searchWords, getSign };
