const express = require('express');
const cors = require('cors');
const path = require('path');
const { searchWords, getSign } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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

app.listen(PORT, () => {
  console.log(`LIS Phraser API in ascolto su http://localhost:${PORT}`);
});
