const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'phrases.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
}

function readAll() {
  ensureStore();
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(phrases) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(phrases, null, 2), 'utf-8');
}

function list() {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const clean = [];
  for (const t of tags) {
    const trimmed = String(t).trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    clean.push(trimmed);
  }
  return clean;
}

function create(name, words, tags) {
  if (!name || !name.trim()) throw new Error('Nome frase mancante');
  if (!Array.isArray(words) || words.length === 0) throw new Error('Frase senza parole');

  const phrase = {
    id: crypto.randomUUID(),
    name: name.trim(),
    tags: sanitizeTags(tags),
    words,
    createdAt: Date.now()
  };

  const phrases = readAll();
  phrases.push(phrase);
  writeAll(phrases);
  return phrase;
}

function update(id, { name, tags }) {
  const phrases = readAll();
  const phrase = phrases.find((p) => p.id === id);
  if (!phrase) return null;

  if (name !== undefined) {
    if (!name.trim()) throw new Error('Nome frase mancante');
    phrase.name = name.trim();
  }
  if (tags !== undefined) {
    phrase.tags = sanitizeTags(tags);
  }

  writeAll(phrases);
  return phrase;
}

function remove(id) {
  const phrases = readAll();
  const next = phrases.filter((p) => p.id !== id);
  writeAll(next);
  return next.length !== phrases.length;
}

module.exports = { list, create, update, remove };
