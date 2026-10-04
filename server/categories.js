const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'categories.json');

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

function writeAll(categories) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(categories, null, 2), 'utf-8');
}

function list() {
  return readAll();
}

function create(name) {
  if (!name || !name.trim()) throw new Error('Nome categoria mancante');
  const categories = readAll();
  const category = {
    id: crypto.randomUUID(),
    name: name.trim(),
    words: [],
    createdAt: Date.now(),
  };
  categories.push(category);
  writeAll(categories);
  return category;
}

function remove(id) {
  const categories = readAll();
  const next = categories.filter((c) => c.id !== id);
  writeAll(next);
  return next.length !== categories.length;
}

function addWord(id, word) {
  if (!word || !word.videoUrl || !word.title) throw new Error('Parola non valida');
  const categories = readAll();
  const category = categories.find((c) => c.id === id);
  if (!category) return null;

  const already = category.words.some((w) => w.path === word.path);
  if (!already) {
    category.words.push({
      title: word.title,
      videoUrl: word.videoUrl,
      poster: word.poster || null,
      path: word.path || null,
    });
    writeAll(categories);
  }
  return category;
}

function removeWord(id, wordPath) {
  const categories = readAll();
  const category = categories.find((c) => c.id === id);
  if (!category) return null;
  category.words = category.words.filter((w) => w.path !== wordPath);
  writeAll(categories);
  return category;
}

module.exports = { list, create, remove, addWord, removeWord };
