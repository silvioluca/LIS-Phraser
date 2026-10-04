const state = {
  phraseWords: [], // { title, videoUrl, poster, path }
};

const ICONS = {
  edit: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
};

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'saved') loadSavedPhrases();
    if (btn.dataset.tab === 'categories') loadCategories();
  });
});

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
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
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
      <span class="word-category">${escapeHtml(r.category || '')}</span>
    `;
    item.addEventListener('click', () => addWordFromSearch(r));
    searchResultsEl.appendChild(item);
  });
}

async function addWordFromSearch(result) {
  searchResultsEl.classList.remove('open');
  searchInput.value = '';
  try {
    const res = await fetch(`/api/sign?path=${encodeURIComponent(result.path)}`);
    const sign = await res.json();
    if (!res.ok) throw new Error(sign.error || 'Errore recupero segno');
    state.phraseWords.push({
      title: sign.title || result.title,
      videoUrl: sign.videoUrl,
      poster: sign.poster,
      path: result.path,
    });
    renderPhraseWords();
  } catch (err) {
    alert(`Impossibile aggiungere la parola: ${err.message}`);
  }
}

// ---------- Phrase builder ----------
const phraseWordsEl = document.getElementById('phrase-words');
const playSequenceBtn = document.getElementById('play-sequence');
const savePhraseBtn = document.getElementById('save-phrase');
const phraseNameInput = document.getElementById('phrase-name');
const phraseTagsInput = document.getElementById('phrase-tags');

function renderPhraseWords() {
  if (state.phraseWords.length === 0) {
    phraseWordsEl.innerHTML = '<p class="empty-hint">Cerca una parola sopra e aggiungila alla frase.</p>';
  } else {
    phraseWordsEl.innerHTML = '';
    state.phraseWords.forEach((w, idx) => {
      const card = document.createElement('div');
      card.className = 'word-card';
      card.innerHTML = `
        <button class="remove-word" title="Rimuovi">✕</button>
        <video src="${w.videoUrl}" poster="${w.poster || ''}" muted loop autoplay playsinline></video>
        <div class="word-label">${escapeHtml(w.title)}</div>
      `;
      card.querySelector('.remove-word').addEventListener('click', () => {
        state.phraseWords.splice(idx, 1);
        renderPhraseWords();
      });
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
  if (i < 0 || i >= playerWords.length) {
    playerLabel.textContent = 'Fine frase';
    if (playerOnWordChange) playerOnWordChange(-1);
    return;
  }
  playerIndex = i;
  const w = playerWords[i];
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

// ---------- Save phrase ----------
savePhraseBtn.addEventListener('click', async () => {
  const name = phraseNameInput.value.trim();
  if (!name) {
    alert('Dai un nome alla frase prima di salvarla.');
    return;
  }
  const tags = phraseTagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);
  try {
    const res = await fetch('/api/phrases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, words: state.phraseWords, tags }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Errore salvataggio');
    state.phraseWords = [];
    phraseNameInput.value = '';
    phraseTagsInput.value = '';
    renderPhraseWords();
    alert('Frase salvata.');
  } catch (err) {
    alert(`Impossibile salvare: ${err.message}`);
  }
});

// ---------- Saved phrases ----------
const savedListEl = document.getElementById('saved-list');
const editingIds = new Set();

async function loadSavedPhrases() {
  savedListEl.innerHTML = '<p class="saved-empty">Caricamento...</p>';
  try {
    const res = await fetch('/api/phrases');
    const phrases = await res.json();
    renderSavedPhrases(phrases);
  } catch (err) {
    savedListEl.innerHTML = `<p class="saved-empty">Errore: ${escapeHtml(err.message)}</p>`;
  }
}

function playMiniThumbs(thumbsEl) {
  const cards = Array.from(thumbsEl.querySelectorAll('.mini-card'));
  cards.forEach((c) => {
    const v = c.querySelector('video');
    v.onended = null;
    v.pause();
    v.currentTime = 0;
    c.classList.remove('playing');
  });

  let idx = 0;
  function playNext() {
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
    savedListEl.innerHTML = '<p class="saved-empty">Nessuna frase salvata.</p>';
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
        if (!name) { alert('Il nome non può essere vuoto.'); return; }
        try {
          const res = await fetch(`/api/phrases/${p.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, tags }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Errore modifica');
          editingIds.delete(p.id);
          loadSavedPhrases();
        } catch (err) {
          alert(`Impossibile salvare le modifiche: ${err.message}`);
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
        if (!confirm(`Eliminare la frase "${p.name}"?`)) return;
        await fetch(`/api/phrases/${p.id}`, { method: 'DELETE' });
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
      item.addEventListener('click', () => playMiniThumbs(thumbs));
    }

    item.appendChild(header);
    item.appendChild(thumbs);
    savedListEl.appendChild(item);
  });
}

// ---------- Categories ----------
const categoriesListEl = document.getElementById('categories-list');
const newCategoryNameInput = document.getElementById('new-category-name');
const addCategoryBtn = document.getElementById('add-category-btn');

addCategoryBtn.addEventListener('click', async () => {
  const name = newCategoryNameInput.value.trim();
  if (!name) return;
  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Errore creazione categoria');
    newCategoryNameInput.value = '';
    loadCategories();
  } catch (err) {
    alert(`Impossibile creare la categoria: ${err.message}`);
  }
});

async function loadCategories() {
  categoriesListEl.innerHTML = '<p class="category-empty">Caricamento...</p>';
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    renderCategories(categories);
  } catch (err) {
    categoriesListEl.innerHTML = `<p class="category-empty">Errore: ${escapeHtml(err.message)}</p>`;
  }
}

function renderCategories(categories) {
  if (categories.length === 0) {
    categoriesListEl.innerHTML = '<p class="category-empty">Nessuna categoria. Creane una sopra.</p>';
    return;
  }
  categoriesListEl.innerHTML = '';
  categories.forEach((cat) => {
    const card = document.createElement('div');
    card.className = 'category-card';
    card.innerHTML = `
      <div class="category-header">
        <h3>${escapeHtml(cat.name)}</h3>
        <button class="icon-btn btn-danger-icon delete-category" title="Elimina categoria">${ICONS.trash}</button>
      </div>
      <div class="category-search-box">
        <input type="text" class="category-search-input" placeholder="Cerca e aggiungi un segno...">
        <div class="category-search-results search-results"></div>
      </div>
      <div class="category-grid"></div>
    `;

    card.querySelector('.delete-category').addEventListener('click', async () => {
      if (!confirm(`Eliminare la categoria "${cat.name}"?`)) return;
      await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' });
      loadCategories();
    });

    const grid = card.querySelector('.category-grid');
    renderCategoryGrid(grid, cat);

    const searchInputEl = card.querySelector('.category-search-input');
    const searchResultsEl2 = card.querySelector('.category-search-results');
    let localTimer = null;
    searchInputEl.addEventListener('input', () => {
      clearTimeout(localTimer);
      const q = searchInputEl.value.trim();
      if (!q) {
        searchResultsEl2.classList.remove('open');
        searchResultsEl2.innerHTML = '';
        return;
      }
      localTimer = setTimeout(async () => {
        searchResultsEl2.innerHTML = '<div class="search-status">Ricerca in corso...</div>';
        searchResultsEl2.classList.add('open');
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
          const results = await res.json();
          if (!res.ok) throw new Error(results.error || 'Errore ricerca');
          if (results.length === 0) {
            searchResultsEl2.innerHTML = '<div class="search-status">Nessun risultato</div>';
            return;
          }
          searchResultsEl2.innerHTML = '';
          results.forEach((r) => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
              <span class="word-title">${escapeHtml(r.title)}</span>
              <span class="word-category">${escapeHtml(r.category || '')}</span>
            `;
            item.addEventListener('click', async () => {
              searchResultsEl2.classList.remove('open');
              searchInputEl.value = '';
              try {
                const signRes = await fetch(`/api/sign?path=${encodeURIComponent(r.path)}`);
                const sign = await signRes.json();
                if (!signRes.ok) throw new Error(sign.error || 'Errore recupero segno');
                const addRes = await fetch(`/api/categories/${cat.id}/words`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: sign.title || r.title,
                    videoUrl: sign.videoUrl,
                    poster: sign.poster,
                    path: r.path,
                  }),
                });
                const updatedCat = await addRes.json();
                if (!addRes.ok) throw new Error(updatedCat.error || 'Errore aggiunta segno');
                renderCategoryGrid(grid, updatedCat);
              } catch (err) {
                alert(`Impossibile aggiungere il segno: ${err.message}`);
              }
            });
            searchResultsEl2.appendChild(item);
          });
        } catch (err) {
          searchResultsEl2.innerHTML = `<div class="search-status">Errore: ${escapeHtml(err.message)}</div>`;
        }
      }, 350);
    });

    categoriesListEl.appendChild(card);
  });
}

function renderCategoryGrid(gridEl, category) {
  if (!category.words || category.words.length === 0) {
    gridEl.innerHTML = '<p class="category-empty">Nessun segno. Cercalo sopra per aggiungerlo.</p>';
    return;
  }
  gridEl.innerHTML = '';
  category.words.forEach((w) => {
    const square = document.createElement('div');
    square.className = 'square-card';
    square.innerHTML = `
      <button class="square-remove" title="Rimuovi dalla categoria">✕</button>
      <video src="${w.videoUrl}" poster="${w.poster || ''}" muted loop playsinline preload="none"></video>
      <span class="square-label">${escapeHtml(w.title)}</span>
    `;
    square.querySelector('.square-remove').addEventListener('click', async (e) => {
      e.stopPropagation();
      const res = await fetch(`/api/categories/${category.id}/words?path=${encodeURIComponent(w.path)}`, { method: 'DELETE' });
      const updatedCat = await res.json();
      if (res.ok) renderCategoryGrid(gridEl, updatedCat);
    });
    square.addEventListener('click', () => {
      const video = square.querySelector('video');
      gridEl.querySelectorAll('video').forEach((v) => {
        if (v !== video) v.pause();
      });
      video.play();
    });
    square.addEventListener('dblclick', () => {
      square.querySelector('video').pause();
      openPlayer([w]);
    });
    gridEl.appendChild(square);
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.category-search-box')) {
    document.querySelectorAll('.category-search-results').forEach((el) => el.classList.remove('open'));
  }
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

renderPhraseWords();
