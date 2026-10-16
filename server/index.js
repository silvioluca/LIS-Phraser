const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { searchWords, getSign } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

const FIREBASE_PROJECT_ID = 'lis-phraser';
const CLOUDINARY_FOLDER = 'lis-phraser';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://silvioluca.github.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

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

function readEmailFromIdToken(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    return payload.email_verified ? payload.email : null;
  } catch {
    return null;
  }
}

// L'email letta dal token non e' ancora verificata: la conferma arriva da Firestore,
// che controlla la firma del token e applica la regola "editors/{email} leggibile solo dal proprietario".
async function isEditor(idToken, email) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/editors/${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  return res.ok;
}

app.post('/api/upload-signature', async (req, res) => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return res.status(500).json({ error: 'Cloudinary non configurato sul server' });
  }

  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const email = idToken && readEmailFromIdToken(idToken);
  if (!email) return res.status(401).json({ error: 'Accesso richiesto' });

  try {
    if (!(await isEditor(idToken, email))) {
      return res.status(403).json({ error: 'Solo gli editor possono caricare video' });
    }
  } catch {
    return res.status(502).json({ error: 'Verifica dei permessi non riuscita' });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `folder=${CLOUDINARY_FOLDER}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(toSign + CLOUDINARY_API_SECRET).digest('hex');

  res.json({
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    folder: CLOUDINARY_FOLDER,
    timestamp,
    signature,
  });
});

app.listen(PORT, () => {
  console.log(`LIS Phraser API in ascolto su http://localhost:${PORT}`);
});
