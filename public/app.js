import { auth, googleProvider, SCRAPER_API_BASE } from './firebase-init.js';
import {
  signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  checkIsEditor,
  listPhrases, createPhrase, updatePhrase, deletePhrase,
  listCategories, createCategory, deleteCategory, setCategoryCover,
  addWordToCategory, removeWordFromCategory,
  uploadRecordedVideo,
} from './data-store.js';

const state = {
  phraseWords: [], // { title, videoUrl, poster, path }
};

const ICONS = {
  edit: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
};

// ---------- Navigazione e accesso ----------
const pageHome = document.getElementById('page-home');
const pageApp = document.getElementById('page-app');
const loginBtn = document.getElementById('login-btn');
const userBox = document.getElementById('user-box');
const userEmailEl = document.getElementById('user-email');
const signoutBtn = document.getElementById('signout-btn');

let isEditor = false;
let currentView = 'home';

onAuthStateChanged(auth, async (user) => {
  loginBtn.classList.toggle('hidden', Boolean(user));
  userBox.classList.toggle('hidden', !user);
  userEmailEl.textContent = user ? user.email : '';
  isEditor = user ? await checkIsEditor(user.email) : false;
  document.body.classList.toggle('is-editor', isEditor);
  if (!user && currentView === 'saved') navigate('home');
});

async function ensureSignedIn() {
  if (auth.currentUser) return true;
  try {
    await signInWithPopup(auth, googleProvider);
    return true;
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      showMessage(`Accesso non riuscito: ${err.message}`);
    }
    return false;
  }
}

async function navigate(view) {
  if (view === 'saved' && !(await ensureSignedIn())) return;
  currentView = view;
  document.querySelectorAll('.nav-link').forEach((l) => l.classList.toggle('active', l.dataset.nav === view));
  window.scrollTo(0, 0);
  if (view === 'home') {
    pageApp.classList.add('hidden');
    pageHome.classList.remove('hidden');
    return;
  }
  pageHome.classList.add('hidden');
  pageApp.classList.remove('hidden');
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${view}`));
  if (view === 'saved') loadSavedPhrases();
  if (view === 'glossario') showGlossarioGrid();
}

document.querySelectorAll('[data-nav]').forEach((el) => {
  el.addEventListener('click', () => navigate(el.dataset.nav));
});
loginBtn.addEventListener('click', ensureSignedIn);
signoutBtn.addEventListener('click', () => signOut(auth));

// ---------- Dialog (sostituisce alert/confirm) ----------
const dialogModal = document.getElementById('dialog-modal');
const dialogMessage = document.getElementById('dialog-message');
const dialogOkBtn = document.getElementById('dialog-ok');
const dialogCancelBtn = document.getElementById('dialog-cancel');

function showMessage(message) {
  return new Promise((resolve) => {
    dialogMessage.textContent = message;
    dialogCancelBtn.classList.add('hidden-btn');
    dialogOkBtn.textContent = 'OK';
    dialogModal.classList.remove('hidden');
    const onOk = () => {
      dialogModal.classList.add('hidden');
      dialogOkBtn.removeEventListener('click', onOk);
      resolve();
    };
    dialogOkBtn.addEventListener('click', onOk);
  });
}

function showConfirm(message) {
  return new Promise((resolve) => {
    dialogMessage.textContent = message;
    dialogCancelBtn.classList.remove('hidden-btn');
    dialogOkBtn.textContent = 'Conferma';
    dialogModal.classList.remove('hidden');
    const cleanup = () => {
      dialogModal.classList.add('hidden');
      dialogOkBtn.removeEventListener('click', onOk);
      dialogCancelBtn.removeEventListener('click', onCancel);
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    dialogOkBtn.addEventListener('click', onOk);
    dialogCancelBtn.addEventListener('click', onCancel);
  });
}

// ---------- Search ----------
const searchInput = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');
let searchTimer = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (!q) {
    searchResultsEl.classList.remove('open');
    searchResultsEl.innerHTML = '';
    return;
  }
  searchTimer = setTimeout(() => runSearch(q), 350);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box')) searchResultsEl.classList.remove('open');
});

async function runSearch(q) {
  searchResultsEl.innerHTML = '<div class="search-status">Ricerca in corso...</div>';
  searchResultsEl.classList.add('open');
  try {
    const res = await fetch(`${SCRAPER_API_BASE}/api/search?q=${encodeURIComponent(q)}`);
    const results = await res.json();
    if (!res.ok) throw new Error(results.error || 'Errore ricerca');
    renderSearchResults(results);
  } catch (err) {
    searchResultsEl.innerHTML = `<div class="search-status">Errore: ${escapeHtml(err.message)}</div>`;
  }
}

function renderSearchResults(results) {
  if (results.length === 0) {
    searchResultsEl.innerHTML = '<div class="search-status">Nessun risultato</div>';
    return;
  }
  searchResultsEl.innerHTML = '';
  results.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
      <span class="word-title">${escapeHtml(r.title)}</span>
      <span class="word-meta">
        <span class="word-category">${escapeHtml(r.category || '')}</span>
        <span class="word-source word-source-${escapeHtml(r.source || '')}">${escapeHtml(r.source || '')}</span>
      </span>
    `;
    item.addEventListener('click', () => addWordFromSearch(r));
    searchResultsEl.appendChild(item);
  });
}

async function addWordFromSearch(result) {
  searchResultsEl.classList.remove('open');
  searchInput.value = '';
  try {
    const res = await fetch(`${SCRAPER_API_BASE}/api/sign?path=${encodeURIComponent(result.path)}`);
    const sign = await res.json();
    if (!res.ok) throw new Error(sign.error || 'Errore recupero segno');
    const word = {
      title: sign.title || result.title,
      videoUrl: sign.videoUrl,
      poster: sign.poster,
      path: result.path,
      source: result.source || sign.source || null,
    };
    state.phraseWords.push(word);
    renderPhraseWords();
    openPlayer([word]);
  } catch (err) {
    showMessage(`Impossibile aggiungere la parola: ${err.message}`);
  }
}

// ---------- Phrase builder ----------
const phraseWordsEl = document.getElementById('phrase-words');
const playSequenceBtn = document.getElementById('play-sequence');
const savePhraseBtn = document.getElementById('save-phrase');
const phraseNameInput = document.getElementById('phrase-name');
const phraseTagsInput = document.getElementById('phrase-tags');
const createStageEl = document.querySelector('.create-stage');
const phraseBuilderEl = document.querySelector('.phrase-builder');

function updateCreateStage() {
  const isEmpty = state.phraseWords.length === 0;
  if (isEmpty) {
    createStageEl.classList.add('is-empty');
    phraseBuilderEl.classList.remove('visible');
  } else {
    createStageEl.classList.remove('is-empty');
    requestAnimationFrame(() => requestAnimationFrame(() => phraseBuilderEl.classList.add('visible')));
  }
}

function renderPhraseWords() {
  updateCreateStage();
  if (state.phraseWords.length === 0) {
    phraseWordsEl.innerHTML = '<p class="empty-hint">Cerca una parola sopra e aggiungila alla frase.</p>';
  } else {
    phraseWordsEl.innerHTML = '';
    state.phraseWords.forEach((w, idx) => {
      const card = document.createElement('div');
      card.className = 'word-card';
      card.innerHTML = `
        <button class="remove-word" title="Rimuovi">✕</button>
        <video src="${w.videoUrl}" poster="${w.poster || ''}" muted loop playsinline preload="metadata"></video>
        <div class="word-label">${escapeHtml(w.title)}</div>
      `;
      card.querySelector('.remove-word').addEventListener('click', (e) => {
        e.stopPropagation();
        state.phraseWords.splice(idx, 1);
        renderPhraseWords();
      });
      attachHoverPreview(card, card.querySelector('video'));
      card.addEventListener('click', () => openPlayer([w]));
      phraseWordsEl.appendChild(card);
    });
  }
  const hasWords = state.phraseWords.length > 0;
  playSequenceBtn.disabled = !hasWords;
  savePhraseBtn.disabled = !hasWords;
}

// ---------- Big player (modal) ----------
const playerModal = document.getElementById('player-modal');
const sequencePlayer = document.getElementById('sequence-player');
const playerLabel = document.getElementById('player-label');
const playerCloseBtn = document.getElementById('player-close');
const playerRestartBtn = document.getElementById('player-restart');
const playerPlayPauseBtn = document.getElementById('player-playpause');
const speedRange = document.getElementById('speed-range');
const speedValueEl = document.getElementById('speed-value');

let currentSpeed = 1;
let playerWords = [];
let playerIndex = 0;
let playerOnWordChange = null;

function loadWordAt(i) {
  if (i < 0 || i >= playerWords.length) return;
  playerIndex = i;
  const w = playerWords[i];
  const isLast = i === playerWords.length - 1;
  sequencePlayer.loop = isLast;
  sequencePlayer.src = w.videoUrl;
  sequencePlayer.poster = w.poster || '';
  sequencePlayer.playbackRate = currentSpeed;
  playerLabel.textContent = w.title;
  if (playerOnWordChange) playerOnWordChange(i);
  sequencePlayer.play();
}

sequencePlayer.addEventListener('ended', () => loadWordAt(playerIndex + 1));
sequencePlayer.addEventListener('play', () => { playerPlayPauseBtn.textContent = '⏸'; });
sequencePlayer.addEventListener('pause', () => { playerPlayPauseBtn.textContent = '▶'; });

function openPlayer(words, onWordChange) {
  if (!words || words.length === 0) return;
  playerWords = words;
  playerOnWordChange = onWordChange || null;
  playerModal.classList.remove('hidden');
  loadWordAt(0);
}

function closePlayer() {
  sequencePlayer.pause();
  sequencePlayer.removeAttribute('src');
  playerLabel.textContent = '';
  playerModal.classList.add('hidden');
  if (playerOnWordChange) playerOnWordChange(-1);
  playerWords = [];
  playerOnWordChange = null;
}

playerRestartBtn.addEventListener('click', () => loadWordAt(0));
playerPlayPauseBtn.addEventListener('click', () => {
  if (sequencePlayer.paused) sequencePlayer.play();
  else sequencePlayer.pause();
});

speedRange.addEventListener('input', () => {
  currentSpeed = parseFloat(speedRange.value);
  speedValueEl.textContent = `${currentSpeed.toFixed(2)}x`;
  sequencePlayer.playbackRate = currentSpeed;
});

playerCloseBtn.addEventListener('click', closePlayer);
playerModal.addEventListener('click', (e) => {
  if (e.target === playerModal) closePlayer();
});

playSequenceBtn.addEventListener('click', () => openPlayer(state.phraseWords));

// ---------- Registrazione segni (usata dagli editor nel glossario) ----------
const recordModal = document.getElementById('record-modal');
const recordVideo = document.getElementById('record-preview');
const recordTitleInput = document.getElementById('record-title');
const recordCloseBtn = document.getElementById('record-close');
const recordStartBtn = document.getElementById('record-start-btn');
const recordStopBtn = document.getElementById('record-stop-btn');
const recordRetryBtn = document.getElementById('record-retry-btn');
const recordSaveBtn = document.getElementById('record-save-btn');
const recordStatus = document.getElementById('record-status');

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordedBlob = null;
let recordOnSave = null;

async function openRecordModal(onSave) {
  recordOnSave = onSave;
  recordModal.classList.remove('hidden');
  recordTitleInput.value = '';
  recordedBlob = null;
  recordStatus.textContent = '';
  setRecordButtons('idle');
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    recordVideo.srcObject = mediaStream;
    recordVideo.muted = true;
    recordVideo.loop = false;
    await recordVideo.play();
  } catch (err) {
    recordStatus.textContent = `Impossibile accedere alla webcam: ${err.message}`;
  }
}

function stopStream() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}

function closeRecordModal() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  stopStream();
  recordVideo.srcObject = null;
  recordVideo.removeAttribute('src');
  recordModal.classList.add('hidden');
}

function setRecordButtons(mode) {
  // mode: 'idle' | 'recording' | 'preview' | 'uploading'
  recordStartBtn.classList.toggle('hidden', mode !== 'idle');
  recordStopBtn.classList.toggle('hidden', mode !== 'recording');
  recordRetryBtn.classList.toggle('hidden', mode !== 'preview');
  recordSaveBtn.disabled = mode !== 'preview';
  recordSaveBtn.textContent = mode === 'uploading' ? 'Caricamento...' : 'Usa questo segno';
}

recordCloseBtn.addEventListener('click', closeRecordModal);
recordModal.addEventListener('click', (e) => { if (e.target === recordModal) closeRecordModal(); });

recordStartBtn.addEventListener('click', () => {
  if (!mediaStream) return;
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm' });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    recordedBlob = new Blob(recordedChunks, { type: 'video/webm' });
    stopStream();
    recordVideo.srcObject = null;
    recordVideo.src = URL.createObjectURL(recordedBlob);
    recordVideo.muted = true;
    recordVideo.loop = true;
    recordVideo.play();
    setRecordButtons('preview');
  };
  mediaRecorder.start();
  setRecordButtons('recording');
  recordStatus.textContent = 'Registrazione in corso...';
});

recordStopBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  recordStatus.textContent = '';
});

recordRetryBtn.addEventListener('click', () => {
  recordVideo.removeAttribute('src');
  recordedBlob = null;
  openRecordModal(recordOnSave);
});

recordSaveBtn.addEventListener('click', async () => {
  const title = recordTitleInput.value.trim();
  if (!title) {
    showMessage('Dai un nome al segno prima di usarlo.');
    return;
  }
  if (!recordedBlob) return;
  setRecordButtons('uploading');
  try {
    const { videoUrl, path } = await uploadRecordedVideo(recordedBlob);
    await recordOnSave({ title, videoUrl, poster: null, path, source: 'custom' });
    closeRecordModal();
  } catch (err) {
    setRecordButtons('preview');
    showMessage(`Impossibile caricare il video: ${err.message}`);
  }
});

// ---------- Save phrase ----------
savePhraseBtn.addEventListener('click', async () => {
  const name = phraseNameInput.value.trim();
  if (!name) {
    showMessage('Dai un nome alla frase prima di salvarla.');
    return;
  }
  if (!(await ensureSignedIn())) return;
  const tags = phraseTagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);
  try {
    await createPhrase(auth.currentUser.email, name, state.phraseWords, tags);
    state.phraseWords = [];
    phraseNameInput.value = '';
    phraseTagsInput.value = '';
    renderPhraseWords();
    showMessage('Frase salvata.');
  } catch (err) {
    showMessage(`Impossibile salvare: ${err.message}`);
  }
});

// ---------- Saved phrases ----------
const savedListEl = document.getElementById('saved-list');
const editingIds = new Set();

async function loadSavedPhrases() {
  savedListEl.innerHTML = '<p class="saved-empty">Caricamento...</p>';
  try {
    const phrases = await listPhrases(auth.currentUser.email);
    renderSavedPhrases(phrases);
  } catch (err) {
    savedListEl.innerHTML = `<p class="saved-empty">Errore: ${escapeHtml(err.message)}</p>`;
  }
}

function attachHoverPreview(el, video) {
  el.addEventListener('mouseenter', () => video.play().catch(() => {}));
  el.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
}

function stopMiniThumbs(thumbsEl) {
  thumbsEl.playToken = (thumbsEl.playToken || 0) + 1;
  thumbsEl.querySelectorAll('.mini-card').forEach((c) => {
    const v = c.querySelector('video');
    v.onended = null;
    v.pause();
    v.currentTime = 0;
    c.classList.remove('playing');
  });
}

function playMiniThumbs(thumbsEl) {
  stopMiniThumbs(thumbsEl);
  const token = thumbsEl.playToken;
  const cards = Array.from(thumbsEl.querySelectorAll('.mini-card'));

  let idx = 0;
  function playNext() {
    // Un mouseleave o una nuova anteprima invalidano la sequenza in corso.
    if (thumbsEl.playToken !== token) return;
    cards.forEach((c) => c.classList.remove('playing'));
    if (idx >= cards.length) return;
    const card = cards[idx];
    const video = card.querySelector('video');
    card.classList.add('playing');
    video.currentTime = 0;
    video.onended = () => {
      idx += 1;
      playNext();
    };
    video.play().catch(() => {
      idx += 1;
      playNext();
    });
  }
  playNext();
}

function renderSavedPhrases(phrases) {
  if (phrases.length === 0) {
    savedListEl.innerHTML = '<p class="saved-empty">Non hai ancora salvato frasi. Componine una nel Dizionario e premi "Salva frase".</p>';
    return;
  }
  savedListEl.innerHTML = '';
  phrases.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'saved-item';

    const header = document.createElement('div');
    header.className = 'saved-header';
    const date = new Date(p.createdAt).toLocaleString('it-IT');
    const isEditing = editingIds.has(p.id);

    if (isEditing) {
      header.innerHTML = `
        <div class="saved-edit-fields">
          <input class="edit-name" type="text" value="${escapeHtml(p.name)}" placeholder="Nome frase">
          <input class="edit-tags" type="text" value="${escapeHtml((p.tags || []).join(', '))}" placeholder="Tag separati da virgola">
        </div>
        <div class="saved-actions">
          <button class="icon-btn btn-confirm-icon btn-confirm-edit" title="Salva modifiche">✓</button>
          <button class="icon-btn btn-cancel-edit" title="Annulla">✕</button>
        </div>
      `;
      header.querySelector('.edit-name').addEventListener('click', (e) => e.stopPropagation());
      header.querySelector('.edit-tags').addEventListener('click', (e) => e.stopPropagation());
      header.querySelector('.btn-confirm-edit').addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = header.querySelector('.edit-name').value.trim();
        const tags = header.querySelector('.edit-tags').value.split(',').map((t) => t.trim()).filter(Boolean);
        if (!name) { showMessage('Il nome non può essere vuoto.'); return; }
        try {
          await updatePhrase(p.id, { name, tags });
          editingIds.delete(p.id);
          loadSavedPhrases();
        } catch (err) {
          showMessage(`Impossibile salvare le modifiche: ${err.message}`);
        }
      });
      header.querySelector('.btn-cancel-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        editingIds.delete(p.id);
        loadSavedPhrases();
      });
    } else {
      const tagsHtml = (p.tags || []).length
        ? `<div class="saved-tags">${p.tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>`
        : '';
      header.innerHTML = `
        <div>
          <div class="saved-name">${escapeHtml(p.name)}</div>
          <div class="saved-meta">${p.words.length} parole · ${date}</div>
          ${tagsHtml}
        </div>
        <div class="saved-actions">
          <button class="icon-btn btn-play" title="Riproduci">▶</button>
          <button class="icon-btn btn-edit" title="Modifica">${ICONS.edit}</button>
          <button class="icon-btn btn-danger-icon btn-delete" title="Elimina">${ICONS.trash}</button>
        </div>
      `;
      header.querySelector('.btn-play').addEventListener('click', (e) => {
        e.stopPropagation();
        const cards = Array.from(thumbs.querySelectorAll('.mini-card'));
        openPlayer(p.words, (activeIdx) => {
          cards.forEach((c, idx) => c.classList.toggle('playing', idx === activeIdx));
        });
      });
      header.querySelector('.btn-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        editingIds.add(p.id);
        loadSavedPhrases();
      });
      header.querySelector('.btn-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!await showConfirm(`Eliminare la frase "${p.name}"?`)) return;
        await deletePhrase(p.id);
        loadSavedPhrases();
      });
    }

    const thumbs = document.createElement('div');
    thumbs.className = 'saved-thumbs';
    p.words.forEach((w) => {
      const mini = document.createElement('div');
      mini.className = 'mini-card';
      mini.innerHTML = `
        <video class="mini-video" src="${w.videoUrl}" poster="${w.poster || ''}" muted playsinline preload="none"></video>
        <span class="mini-label">${escapeHtml(w.title)}</span>
      `;
      thumbs.appendChild(mini);
    });

    if (!isEditing) {
      item.addEventListener('mouseenter', () => playMiniThumbs(thumbs));
      item.addEventListener('mouseleave', () => stopMiniThumbs(thumbs));
      item.addEventListener('click', () => {
        stopMiniThumbs(thumbs);
        const cards = Array.from(thumbs.querySelectorAll('.mini-card'));
        openPlayer(p.words, (activeIdx) => {
          cards.forEach((c, i) => c.classList.toggle('playing', i === activeIdx));
        });
      });
    }

    item.appendChild(header);
    item.appendChild(thumbs);
    savedListEl.appendChild(item);
  });
}

// ---------- Glossario (lettura pubblica, modifica solo per gli editor) ----------
const glossarioGridView = document.getElementById('glossario-grid-view');
const glossarioDetailView = document.getElementById('glossario-detail-view');
const subjectGridEl = document.getElementById('subject-grid');
const newCategoryNameInput = document.getElementById('new-category-name');
const addCategoryBtn = document.getElementById('add-category-btn');
const backToGlossarioBtn = document.getElementById('back-to-glossario');
const detailCategoryNameEl = document.getElementById('detail-category-name');
const deleteCategoryBtn = document.getElementById('delete-category-btn');
const openAddwordBtn = document.getElementById('open-addword-btn');
const detailGridEl = document.getElementById('detail-grid');

const STAR_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

deleteCategoryBtn.innerHTML = ICONS.trash;

let currentCategory = null;

addCategoryBtn.addEventListener('click', async () => {
  const name = newCategoryNameInput.value.trim();
  if (!name) return;
  try {
    await createCategory(name);
    newCategoryNameInput.value = '';
    showGlossarioGrid();
  } catch (err) {
    showMessage(`Impossibile creare la materia: ${err.message}`);
  }
});

async function showGlossarioGrid() {
  currentCategory = null;
  glossarioDetailView.classList.add('hidden');
  glossarioGridView.classList.remove('hidden');
  subjectGridEl.innerHTML = '<p class="category-empty">Caricamento...</p>';
  try {
    renderSubjectGrid(await listCategories());
  } catch (err) {
    subjectGridEl.innerHTML = `<p class="category-empty">Errore: ${escapeHtml(err.message)}</p>`;
  }
}

function renderSubjectGrid(categories) {
  if (categories.length === 0) {
    subjectGridEl.innerHTML = '<p class="category-empty">Nessuna materia presente.</p>';
    return;
  }
  subjectGridEl.innerHTML = '';
  categories.forEach((cat) => {
    const coverWord = cat.cover || cat.words[0];
    const totalCount = cat.words.length;
    const card = document.createElement('div');
    card.className = 'subject-card';
    card.innerHTML = `
      <div class="subject-video-wrap">
        ${coverWord
          ? `<video src="${coverWord.videoUrl}" poster="${coverWord.poster || ''}" muted loop playsinline preload="metadata"></video>`
          : ''}
      </div>
      <div class="subject-info">
        <p class="subject-name">${escapeHtml(cat.name)}</p>
        <p class="subject-count">${totalCount} ${totalCount === 1 ? 'segno' : 'segni'}</p>
      </div>
    `;
    const video = card.querySelector('video');
    if (video) {
      card.addEventListener('mouseenter', () => video.play());
      card.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
    }
    card.addEventListener('click', () => openCategoryDetail(cat.id));
    subjectGridEl.appendChild(card);
  });
}

async function openCategoryDetail(categoryId) {
  glossarioGridView.classList.add('hidden');
  glossarioDetailView.classList.remove('hidden');
  detailCategoryNameEl.textContent = 'Caricamento...';
  detailGridEl.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    const categories = await listCategories();
    const category = categories.find((c) => c.id === categoryId);
    if (!category) { showMessage('Materia non trovata.'); showGlossarioGrid(); return; }
    currentCategory = category;
    renderCategoryDetail(category);
  } catch (err) {
    showMessage(`Errore caricamento: ${err.message}`);
  }
}

const detailCoverVideoEl = document.querySelector('#detail-cover .detail-cover-video');
const detailCoverTitleEl = document.getElementById('detail-cover-title');
const changeCoverBtn = document.getElementById('change-cover-btn');

function renderCoverPreview(category) {
  const cover = category.cover || category.words[0];
  detailCoverVideoEl.innerHTML = cover
    ? `<video src="${cover.videoUrl}" poster="${cover.poster || ''}" muted loop playsinline preload="metadata"></video>`
    : '';
  detailCoverTitleEl.textContent = category.cover
    ? category.cover.title
    : (cover ? `${cover.title} (primo segno, nessuna copertina scelta)` : 'Nessuna copertina');
  const video = detailCoverVideoEl.querySelector('video');
  if (video) attachHoverPreview(detailCoverVideoEl, video);
}

async function applyCover(word) {
  currentCategory.cover = await setCategoryCover(currentCategory.id, word);
  renderCategoryGrid(detailGridEl, currentCategory);
  renderCoverPreview(currentCategory);
}

function renderCategoryDetail(category) {
  detailCategoryNameEl.textContent = category.name;
  renderCategoryGrid(detailGridEl, category);
  renderCoverPreview(category);

  deleteCategoryBtn.onclick = async () => {
    if (!await showConfirm(`Eliminare la materia "${category.name}" e tutti i suoi segni?`)) return;
    try {
      await deleteCategory(category.id);
      showGlossarioGrid();
    } catch (err) {
      showMessage(`Impossibile eliminare: ${err.message}`);
    }
  };
}

backToGlossarioBtn.addEventListener('click', showGlossarioGrid);

function renderCategoryGrid(gridEl, category) {
  if (category.words.length === 0) {
    gridEl.innerHTML = '<p class="category-empty">Nessun segno in questa materia.</p>';
    return;
  }
  gridEl.innerHTML = '';
  category.words.forEach((w) => {
    const isCover = category.cover && category.cover.videoUrl === w.videoUrl;
    const square = document.createElement('div');
    square.className = `square-card${isCover ? ' is-cover' : ''}`;
    square.innerHTML = `
      <button class="square-remove editor-only" title="Rimuovi dalla materia">✕</button>
      <button class="square-cover editor-only" title="Usa come copertina della materia">${STAR_ICON}</button>
      <video src="${w.videoUrl}" poster="${w.poster || ''}" muted loop playsinline preload="metadata"></video>
      <span class="square-label">${escapeHtml(w.title)}</span>
    `;
    square.querySelector('.square-remove').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const updatedCat = await removeWordFromCategory(category.id, w.path);
        if (updatedCat) { currentCategory = updatedCat; renderCategoryGrid(gridEl, updatedCat); }
      } catch (err) {
        showMessage(`Impossibile rimuovere: ${err.message}`);
      }
    });
    square.querySelector('.square-cover').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await applyCover(w);
      } catch (err) {
        showMessage(`Impossibile impostare la copertina: ${err.message}`);
      }
    });
    attachHoverPreview(square, square.querySelector('video'));
    square.addEventListener('click', () => openPlayer([w]));
    gridEl.appendChild(square);
  });
}

// ---------- Modale "Aggiungi segno" / "Cambia copertina" (cerca sui siti oppure registra) ----------
const addwordModal = document.getElementById('addword-modal');
const addwordTitleEl = document.getElementById('addword-title');
const addwordSubtitleEl = document.getElementById('addword-subtitle');
const addwordSearch = document.getElementById('addword-search');
const addwordResults = document.getElementById('addword-results');
const addwordRecordBtn = document.getElementById('addword-record-btn');
const addwordCloseBtn = document.getElementById('addword-close');

let addwordTimer = null;
let addwordMode = 'word'; // 'word' aggiunge alla materia, 'cover' imposta la copertina della card

async function addWordToCurrentCategory(word) {
  const updatedCat = await addWordToCategory(currentCategory.id, word);
  if (updatedCat) {
    currentCategory = updatedCat;
    renderCategoryGrid(detailGridEl, updatedCat);
    renderCoverPreview(updatedCat);
  }
}

function openAddwordModal(mode) {
  addwordMode = mode;
  if (mode === 'cover') {
    addwordTitleEl.textContent = `Copertina di ${currentCategory.name}`;
    addwordSubtitleEl.textContent = 'Il segno scelto diventa la copertina della card nel glossario, senza essere aggiunto ai segni della materia.';
  } else {
    addwordTitleEl.textContent = `Aggiungi un segno a ${currentCategory.name}`;
    addwordSubtitleEl.textContent = 'Clicca i risultati per aggiungerli: puoi aggiungerne più di uno.';
  }
  addwordSearch.value = '';
  addwordResults.innerHTML = '';
  addwordResults.classList.remove('open');
  addwordModal.classList.remove('hidden');
  addwordSearch.focus();
}

function closeAddwordModal() {
  clearTimeout(addwordTimer);
  addwordModal.classList.add('hidden');
}

openAddwordBtn.addEventListener('click', () => openAddwordModal('word'));
changeCoverBtn.addEventListener('click', () => openAddwordModal('cover'));
addwordCloseBtn.addEventListener('click', closeAddwordModal);
addwordModal.addEventListener('click', (e) => { if (e.target === addwordModal) closeAddwordModal(); });

addwordRecordBtn.addEventListener('click', () => {
  closeAddwordModal();
  openRecordModal(addwordMode === 'cover' ? applyCover : addWordToCurrentCategory);
});

addwordSearch.addEventListener('input', () => {
  clearTimeout(addwordTimer);
  const q = addwordSearch.value.trim();
  if (!q) {
    addwordResults.classList.remove('open');
    addwordResults.innerHTML = '';
    return;
  }
  addwordTimer = setTimeout(async () => {
    addwordResults.innerHTML = '<div class="search-status">Ricerca in corso...</div>';
    addwordResults.classList.add('open');
    try {
      const res = await fetch(`${SCRAPER_API_BASE}/api/search?q=${encodeURIComponent(q)}`);
      const results = await res.json();
      if (!res.ok) throw new Error(results.error || 'Errore ricerca');
      if (results.length === 0) {
        addwordResults.innerHTML = '<div class="search-status">Nessun risultato</div>';
        return;
      }
      addwordResults.innerHTML = '';
      results.forEach((r) => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
          <span class="word-title">${escapeHtml(r.title)}</span>
          <span class="word-meta">
            <span class="word-category">${escapeHtml(r.category || '')}</span>
            <span class="word-source word-source-${escapeHtml(r.source || '')}">${escapeHtml(r.source || '')}</span>
          </span>
        `;
        item.addEventListener('click', async () => {
          if (item.classList.contains('added')) return;
          try {
            const signRes = await fetch(`${SCRAPER_API_BASE}/api/sign?path=${encodeURIComponent(r.path)}`);
            const sign = await signRes.json();
            if (!signRes.ok) throw new Error(sign.error || 'Errore recupero segno');
            const word = {
              title: sign.title || r.title,
              videoUrl: sign.videoUrl,
              poster: sign.poster,
              path: r.path,
              source: r.source || null,
            };
            if (addwordMode === 'cover') {
              await applyCover(word);
              closeAddwordModal();
              return;
            }
            await addWordToCurrentCategory(word);
            item.classList.add('added');
            item.querySelector('.word-category').textContent = 'Aggiunto';
          } catch (err) {
            showMessage(`Operazione non riuscita: ${err.message}`);
          }
        });
        addwordResults.appendChild(item);
      });
    } catch (err) {
      addwordResults.innerHTML = `<div class="search-status">Errore: ${escapeHtml(err.message)}</div>`;
    }
  }, 350);
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

renderPhraseWords();
