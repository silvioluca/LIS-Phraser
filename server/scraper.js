const cheerio = require('cheerio');

const STS_BASE = 'https://spreadthesign.com';
const SS_BASE = 'https://www.sgb-fss.ch';
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

// ---------- SpreadTheSign ----------

async function searchSpreadTheSign(query) {
  const url = `${STS_BASE}/it.it/search/?q=${encodeURIComponent(query)}&cls=2`;
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
      path: `/it.it/word/${match[1]}/${match[2]}/${match[3]}/`,
      title,
      category,
      source: 'SpreadTheSign',
    });
  });

  return results;
}

function isSpreadTheSignPath(path) {
  return /^\/it\.it\/word\/\d+\/[a-z0-9-]+\/\d+\/$/i.test(path);
}

function extractSpreadTheSignSign(html, path) {
  const $ = cheerio.load(html);
  const video = $('video.js-enforce-speed').first();
  const videoUrl = video.attr('src') || video.find('source').first().attr('src');
  const poster = video.attr('poster');
  const title = $('h2').first().text().trim();
  if (!videoUrl) return null;
  return { path, title, videoUrl, poster: poster || null, source: 'SpreadTheSign' };
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Recupero segno fallito (${res.status})`);
  return res.text();
}

async function getSignSpreadTheSign(path) {
  let result = extractSpreadTheSignSign(await fetchHtml(`${STS_BASE}${path}`), path);

  if (!result) {
    // Pagina a volte arriva senza video (hiccup transitorio del sito sorgente): un ritentativo basta quasi sempre.
    await new Promise((r) => setTimeout(r, 400));
    result = extractSpreadTheSignSign(await fetchHtml(`${STS_BASE}${path}`), path);
  }

  if (!result) {
    console.error(`[scraper] SpreadTheSign: video non trovato dopo retry: ${path}`);
    throw new Error('Video non trovato per questo segno');
  }

  return result;
}

// ---------- Signsuisse ----------

async function searchSignsuisse(query) {
  const url = `${SS_BASE}/signsuisse/index.php?eID=signsuisse_search&sword=${encodeURIComponent(query)}&lang=it&category=pleaseselect&curlang=it`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Ricerca fallita (${res.status})`);
  const text = await res.text();
  if (text.trim() === 'null') return [];

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }

  return (data.items || []).map((item) => {
    const path = new URL(item.link).pathname;
    return {
      id: item.uid,
      path,
      title: (item.name || '').toLowerCase(),
      category: item.kategorie || '',
      source: 'Signsuisse',
    };
  });
}

function isSignsuissePath(path) {
  return /^\/signsuisse\/[a-z]{2}\/lexikon\/\d+\/[a-z0-9-]+$/i.test(path);
}

function extractSignsuisseSign(html, path) {
  const $ = cheerio.load(html);
  const video = $('#video-main').first();
  let videoUrl = video.find('source').first().attr('src');
  if (!videoUrl) return null;
  videoUrl = videoUrl.split('#')[0];
  if (videoUrl.startsWith('/')) videoUrl = `${SS_BASE}${videoUrl}`;
  const title = $('h1').first().clone().children('a').remove().end().text().trim().toLowerCase();
  return { path, title, videoUrl, poster: null, source: 'Signsuisse' };
}

async function getSignSignsuisse(path) {
  const html = await fetchHtml(`${SS_BASE}${path}`);
  const result = extractSignsuisseSign(html, path);
  if (!result) {
    console.error(`[scraper] Signsuisse: video non trovato: ${path}`);
    throw new Error('Video non trovato per questo segno');
  }
  return result;
}

// ---------- Combined ----------

async function searchWords(query) {
  const cacheKey = `search:${query}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const [stsResult, ssResult] = await Promise.allSettled([
    searchSpreadTheSign(query),
    searchSignsuisse(query),
  ]);

  const results = [
    ...(stsResult.status === 'fulfilled' ? stsResult.value : []),
    ...(ssResult.status === 'fulfilled' ? ssResult.value : []),
  ];

  if (stsResult.status === 'rejected') console.error('[scraper] SpreadTheSign search error:', stsResult.reason.message);
  if (ssResult.status === 'rejected') console.error('[scraper] Signsuisse search error:', ssResult.reason.message);

  setCached(cacheKey, results);
  return results;
}

function isValidWordPath(path) {
  return isSpreadTheSignPath(path) || isSignsuissePath(path);
}

async function getSign(path) {
  if (!isValidWordPath(path)) {
    throw new Error('Percorso non valido');
  }

  const cacheKey = `sign:${path}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const result = isSpreadTheSignPath(path)
    ? await getSignSpreadTheSign(path)
    : await getSignSignsuisse(path);

  setCached(cacheKey, result);
  return result;
}

module.exports = { searchWords, getSign };
