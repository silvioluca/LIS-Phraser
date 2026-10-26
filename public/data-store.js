import {
  collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, auth, API_BASE } from './firebase-init.js';

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

// ---------- Editor ----------

// Un documento editors/<email> esiste solo per gli account abilitati a modificare il glossario.
export async function checkIsEditor(email) {
  if (!email) return false;
  try {
    const snap = await getDoc(doc(db, 'editors', email));
    return snap.exists();
  } catch {
    return false;
  }
}

// ---------- Phrases (private: ognuno vede solo le proprie) ----------

export async function listPhrases(ownerEmail) {
  // Ordinamento lato client: where + orderBy richiederebbe un indice composto.
  const snap = await getDocs(query(collection(db, 'phrases'), where('ownerEmail', '==', ownerEmail)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function createPhrase(ownerEmail, name, words, tags) {
  if (!name || !name.trim()) throw new Error('Nome frase mancante');
  if (!Array.isArray(words) || words.length === 0) throw new Error('Frase senza parole');
  const payload = {
    ownerEmail,
    name: name.trim(),
    tags: sanitizeTags(tags),
    words,
    createdAt: Date.now(),
  };
  const docRef = await addDoc(collection(db, 'phrases'), payload);
  return { id: docRef.id, ...payload };
}

export async function updatePhrase(id, { name, tags }) {
  const updates = {};
  if (name !== undefined) {
    if (!name.trim()) throw new Error('Nome frase mancante');
    updates.name = name.trim();
  }
  if (tags !== undefined) updates.tags = sanitizeTags(tags);
  await updateDoc(doc(db, 'phrases', id), updates);
  const snap = await getDoc(doc(db, 'phrases', id));
  return { id, ...snap.data() };
}

export async function deletePhrase(id) {
  await deleteDoc(doc(db, 'phrases', id));
}

// ---------- Categories ----------

function normalizeCategory(id, data) {
  return {
    id,
    name: data.name,
    cover: data.cover || null,
    words: data.words || [],
    createdAt: data.createdAt,
  };
}

export async function setCategoryCover(id, word) {
  const cover = { title: word.title, videoUrl: word.videoUrl, poster: word.poster || null };
  await updateDoc(doc(db, 'categories', id), { cover });
  return cover;
}

export async function listCategories() {
  const snap = await getDocs(query(collection(db, 'categories'), orderBy('createdAt', 'asc')));
  return snap.docs.map((d) => normalizeCategory(d.id, d.data()));
}

export async function createCategory(name) {
  if (!name || !name.trim()) throw new Error('Nome categoria mancante');
  const payload = { name: name.trim(), words: [], createdAt: Date.now() };
  const docRef = await addDoc(collection(db, 'categories'), payload);
  return normalizeCategory(docRef.id, payload);
}

export async function deleteCategory(id) {
  await deleteDoc(doc(db, 'categories', id));
}

async function getCategoryRaw(id) {
  const snap = await getDoc(doc(db, 'categories', id));
  if (!snap.exists()) return null;
  return normalizeCategory(id, snap.data());
}

export async function addWordToCategory(id, word) {
  if (!word || !word.videoUrl || !word.title) throw new Error('Parola non valida');
  const category = await getCategoryRaw(id);
  if (!category) return null;
  const already = category.words.some((w) => w.path === word.path);
  if (!already) {
    category.words.push({
      title: word.title,
      videoUrl: word.videoUrl,
      poster: word.poster || null,
      path: word.path || null,
      source: word.source || null,
    });
    await updateDoc(doc(db, 'categories', id), { words: category.words });
  }
  return category;
}

export async function removeWordFromCategory(id, wordPath) {
  const category = await getCategoryRaw(id);
  if (!category) return null;
  category.words = category.words.filter((w) => w.path !== wordPath);
  await updateDoc(doc(db, 'categories', id), { words: category.words });
  return category;
}

// ---------- Video registrati (Cloudinary, upload firmato dal server solo per gli editor) ----------

// Taglio e ritaglio diventano una "trasformazione in ingresso": Cloudinary la applica
// al caricamento e salva solo il video risultante, gia' convertito in MP4.
function buildTransformation(edits) {
  const steps = [];
  const trimParts = [];
  if (edits.start > 0.05) trimParts.push(`so_${edits.start.toFixed(2)}`);
  if (edits.end < edits.duration - 0.05) trimParts.push(`eo_${edits.end.toFixed(2)}`);
  if (trimParts.length) steps.push(trimParts.join(','));

  const { crop, frameWidth: width, frameHeight: height } = edits;
  const isFullFrame = crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999;
  if (!isFullFrame && width && height) {
    const even = (n) => Math.max(2, Math.floor(n / 2) * 2); // H.264 richiede lati pari
    const x = Math.round(crop.x * width);
    const y = Math.round(crop.y * height);
    const w = even(Math.min(crop.w * width, width - x));
    const h = even(Math.min(crop.h * height, height - y));
    steps.push(`c_crop,x_${x},y_${y},w_${w},h_${h}`);
  }
  return steps.join('/');
}

export async function uploadRecordedVideo(blob, edits) {
  if (!auth.currentUser) throw new Error('Accesso richiesto');
  const idToken = await auth.currentUser.getIdToken();
  const sigRes = await fetch(`${API_BASE}/api/upload-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transformation: buildTransformation(edits) }),
  });
  const sig = await sigRes.json();
  if (!sigRes.ok) throw new Error(sig.error || 'Autorizzazione upload negata');

  const formData = new FormData();
  formData.append('file', blob);
  formData.append('api_key', sig.apiKey);
  formData.append('signature', sig.signature);
  Object.entries(sig.params).forEach(([k, v]) => formData.append(k, v));

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Upload video fallito');

  return {
    videoUrl: data.secure_url,
    poster: `https://res.cloudinary.com/${sig.cloudName}/video/upload/so_0/v${data.version}/${data.public_id}.jpg`,
    path: `custom:${data.public_id}`,
  };
}
