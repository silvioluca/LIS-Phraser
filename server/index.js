const express = require('express');
const path = require('path');
const { searchWords, getSign } = require('./scraper');
const phrasesStore = require('./phrases');
const categoriesStore = require('./categories');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json([]);
  try {
    const results = await searchWords(q);
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/sign', async (req, res) => {
  const wordPath = (req.query.path || '').toString();
  try {
    const sign = await getSign(wordPath);
    res.json(sign);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/phrases', (_req, res) => {
  res.json(phrasesStore.list());
});

app.post('/api/phrases', (req, res) => {
  try {
    const { name, words, tags } = req.body || {};
    const phrase = phrasesStore.create(name, words, tags);
    res.status(201).json(phrase);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/phrases/:id', (req, res) => {
  try {
    const { name, tags } = req.body || {};
    const updated = phrasesStore.update(req.params.id, { name, tags });
    if (!updated) return res.status(404).json({ error: 'Frase non trovata' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/phrases/:id', (req, res) => {
  const ok = phrasesStore.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Frase non trovata' });
  res.status(204).end();
});

app.get('/api/categories', (_req, res) => {
  res.json(categoriesStore.list());
});

app.post('/api/categories', (req, res) => {
  try {
    const { name } = req.body || {};
    const category = categoriesStore.create(name);
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', (req, res) => {
  const ok = categoriesStore.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Categoria non trovata' });
  res.status(204).end();
});

app.post('/api/categories/:id/words', (req, res) => {
  try {
    const category = categoriesStore.addWord(req.params.id, req.body || {});
    if (!category) return res.status(404).json({ error: 'Categoria non trovata' });
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/categories/:id/words', (req, res) => {
  const wordPath = (req.query.path || '').toString();
  const category = categoriesStore.removeWord(req.params.id, wordPath);
  if (!category) return res.status(404).json({ error: 'Categoria non trovata' });
  res.json(category);
});

app.post('/api/categories/:id/phrases', (req, res) => {
  try {
    const { phraseId } = req.body || {};
    const phrase = phrasesStore.list().find((p) => p.id === phraseId);
    if (!phrase) return res.status(404).json({ error: 'Frase non trovata' });
    const category = categoriesStore.addPhrase(req.params.id, phrase);
    if (!category) return res.status(404).json({ error: 'Categoria non trovata' });
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/categories/:id/phrases/:phraseId', (req, res) => {
  const category = categoriesStore.removePhrase(req.params.id, req.params.phraseId);
  if (!category) return res.status(404).json({ error: 'Categoria non trovata' });
  res.json(category);
});

app.listen(PORT, () => {
  console.log(`LIS Phraser in ascolto su http://localhost:${PORT}`);
});
