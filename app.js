/* ═══════════════════════════════════════════
   MOVIENOVA — app.js
   TMDB API + multi-source streaming
   ═══════════════════════════════════════════ */

'use strict';

// ─── CONFIG ─────────────────────────────────
const TMDB_KEY = 'PASTE_YOUR_TMDB_API_KEY_HERE';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const SOURCES = {
  vidsrc:     (id, type) => `https://vidsrc.to/embed/${type}/${id}`,
  '2embed':   (id, type) => `https://www.2embed.cc/embed/${id}`,
  superembed: (id, type) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
  moviesapi:  (id, type) => `https://moviesapi.club/${type === 'movie' ? 'movie' : 'tv'}/${id}`
};

// ─── STATE ──────────────────────────────────
let currentMovie = null;
let heroMovies = [];
let currentHeroIdx = 0;
let heroTimer = null;
let watchlist = JSON.parse(localStorage.getItem('mn_watchlist') || '[]');
let history_ = JSON.parse(localStorage.getItem('mn_history') || '[]');
let continueWatching = JSON.parse(localStorage.getItem('mn_continue') || '[]');
let currentTrailerKey = null;
let currentPlayerSource = 'vidsrc';
let currentViewMode = 'home'; // home | watchlist | history | category
let isPlaying = false;
let isMuted = false;
let savedVolume = Number(localStorage.getItem('movienova_volume') || 100);
let lastVolume = savedVolume || 100;
let currentSpeed = 1;
let progressInterval = null;
let fakeProgress = 0;
let subsEnabled = false;
let currentCategory = null;
let notificationsData = [
  { icon: '🎬', title: 'New Arrival', text: 'Dune: Part Two is now available to watch' },
  { icon: '⭐', title: 'Top Rated', text: 'The Last of Us Season 2 hit 9.8 on TMDB' },
  { icon: '🎌', title: 'Anime Alert', text: 'Demon Slayer Season 4 just dropped!' },
];

// ─── TMDB FETCH ─────────────────────────────
async function tmdb(endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', TMDB_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, v);
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('TMDB error:', e.message);
    return { results: [] };
  }
}

function poster(path, size = 'w342') {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}
function backdrop(path, size = 'w1280') {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

// ─── INIT ────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initNavbarScroll();
  renderNotifications();
  loadAllRows();
  initContinueWatching();
});

function initNavbarScroll() {
  const nav = document.getElementById('navbar');
  const update = () => nav.classList.toggle('scrolled', window.scrollY > 60);
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ─── LOAD ALL ROWS ──────────────────────────
async function loadAllRows() {
  // Hero + trending
  const trending = await tmdb('/trending/movie/week');
  heroMovies = (trending.results || []).slice(0, 5);
  if (heroMovies.length) {
    setupHero(heroMovies);
    renderRow('trendingRow', trending.results);
  }

  // Top rated
  const topRated = await tmdb('/movie/top_rated', { language: 'en-US' });
  renderRow('topRatedRow', topRated.results);

  // Anime (Japanese animation TV)
  const anime = await tmdb('/discover/tv', {
    with_genres: '16', with_original_language: 'ja',
    sort_by: 'popularity.desc'
  });
  renderRow('animeRow', anime.results, 'tv');

  // Cartoons (western animation movies)
  const cartoons = await tmdb('/discover/movie', {
    with_genres: '16', without_keywords: '210024',
    sort_by: 'popularity.desc'
  });
  renderRow('cartoonRow', cartoons.results);

  // TV Shows
  const tv = await tmdb('/tv/popular', { language: 'en-US' });
  renderRow('tvRow', tv.results, 'tv');

  // Recently added (now playing)
  const recent = await tmdb('/movie/now_playing');
  renderRow('recentRow', recent.results);

  // Action
  const action = await tmdb('/discover/movie', { with_genres: '28', sort_by: 'popularity.desc' });
  renderRow('actionRow', action.results);

  // Comedy
  const comedy = await tmdb('/discover/movie', { with_genres: '35', sort_by: 'popularity.desc' });
  renderRow('comedyRow', comedy.results);

  // Sci-Fi
  const scifi = await tmdb('/discover/movie', { with_genres: '878', sort_by: 'popularity.desc' });
  renderRow('scifiRow', scifi.results);
}

// ─── HERO ────────────────────────────────────
function setupHero(movies) {
  renderHeroSlide(movies[0], 0);

  // Thumbnails
  const thumbs = document.getElementById('heroThumbs');
  thumbs.innerHTML = movies.map((m, i) => `
    <div class="hero-thumb ${i === 0 ? 'active' : ''}" onclick="setHeroMovie(${i})" id="heroThumb${i}">
      <img src="${poster(m.poster_path)}" alt="${m.title || m.name}" loading="lazy"
           onerror="this.style.display='none'"/>
    </div>
  `).join('');

  // Auto-cycle
  clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    currentHeroIdx = (currentHeroIdx + 1) % movies.length;
    setHeroMovie(currentHeroIdx);
  }, 8000);
}

function setHeroMovie(idx) {
  currentHeroIdx = idx;
  heroMovies.forEach((_, i) => {
    document.getElementById(`heroThumb${i}`)?.classList.toggle('active', i === idx);
  });
  renderHeroSlide(heroMovies[idx], idx);
}

function renderHeroSlide(movie, idx) {
  if (!movie) return;
  const bg = document.getElementById('heroBg');
  const title = document.getElementById('heroTitle');
  const desc = document.getElementById('heroDesc');
  const meta = document.getElementById('heroMeta');

  const bgUrl = backdrop(movie.backdrop_path) || poster(movie.poster_path, 'original');
  if (bgUrl) bg.style.backgroundImage = `url(${bgUrl})`;

  title.textContent = movie.title || movie.name || 'Unknown';
  desc.textContent = movie.overview || '';

  const rating = movie.vote_average ? `⭐ ${movie.vote_average.toFixed(1)}` : '';
  const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  meta.innerHTML = `
    ${rating ? `<span class="rating">${rating}</span>` : ''}
    ${year ? `<span class="year">${year}</span>` : ''}
    <span class="genre">HD · Free</span>
  `;
  updateHeroWatchlistBtn(movie);
}

function updateHeroWatchlistBtn(movie) {
  const btn = document.getElementById('heroListBtn');
  if (!btn || !movie) return;
  const inList = watchlist.some(w => w.id === movie.id);
  btn.innerHTML = inList
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`;
}

function playHeroMovie() {
  const movie = heroMovies[currentHeroIdx];
  if (movie) openPlayerForMovie(movie.id, 'movie', movie.title || movie.name);
}

function showHeroInfo() {
  const movie = heroMovies[currentHeroIdx];
  if (movie) openMovieModal(movie.id, 'movie');
}

function toggleHeroWatchlist() {
  const movie = heroMovies[currentHeroIdx];
  if (!movie) return;
  toggleWatchlistItem(movie, 'movie');
  updateHeroWatchlistBtn(movie);
}

// ─── RENDER ROW ─────────────────────────────
function renderRow(rowId, items, type = 'movie') {
  const row = document.getElementById(rowId);
  if (!row) return;

  // Show skeletons first
  row.innerHTML = Array(8).fill('').map(() => `<div class="skeleton skeleton-card"></div>`).join('');

  setTimeout(() => {
    if (!items || !items.length) {
      row.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:20px 0">Nothing found here yet</p>';
      return;
    }
    row.innerHTML = items.map(m => buildCard(m, type)).join('');
  }, 200);
}

function buildCard(movie, type = 'movie') {
  const id = movie.id;
  const title = movie.title || movie.name || 'Unknown';
  const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '—';
  const inList = watchlist.some(w => w.id === id);
  const continueItem = continueWatching.find(c => c.id === id);
  const imgSrc = poster(movie.poster_path);

  return `
  <div class="movie-card${continueItem ? ' continue-card' : ''}" onclick="openMovieModal(${id},'${type}')">
    ${imgSrc
      ? `<img class="card-poster" src="${imgSrc}" alt="${title}" loading="lazy"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
         <div class="card-poster-placeholder" style="display:none">🎬<span>${title}</span></div>`
      : `<div class="card-poster-placeholder">🎬<span>${title}</span></div>`
    }
    ${continueItem
      ? `<div class="continue-progress"><div class="continue-progress-fill" style="width:${continueItem.progress || 0}%"></div></div>`
      : ''}
    <div class="card-info">
      <div class="card-title" title="${title}">${title}</div>
      <div class="card-meta">
        <span class="card-rating">⭐ ${rating}</span>
        <span>${year}</span>
      </div>
    </div>
    <div class="card-overlay">
      <div class="card-title" style="color:white;font-size:12px">${title}</div>
      <div class="card-overlay-actions">
        <button class="card-btn" onclick="event.stopPropagation();openPlayerForMovie(${id},'${type}','${escAttr(title)}')">▶ Play</button>
        <button class="card-btn-outline" onclick="event.stopPropagation();openMovieModal(${id},'${type}')">Info</button>
      </div>
    </div>
    <button class="card-watchlist-icon ${inList ? 'in-list' : ''}" 
            id="wl${id}"
            onclick="event.stopPropagation();toggleWatchlistCard(${id},'${type}',this)"
            title="${inList ? 'Remove from list' : 'Add to list'}">
      ${inList ? '✓' : '+'}
    </button>
  </div>`;
}

function escAttr(s) { return s.replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

// ─── SEARCH ─────────────────────────────────
let searchTimer = null;
function toggleSearch() {
  const bar = document.getElementById('searchBar');
  const input = document.getElementById('searchInput');
  bar.classList.toggle('open');
  if (bar.classList.contains('open')) {
    setTimeout(() => input.focus(), 200);
  } else {
    input.value = '';
    document.getElementById('searchResults').innerHTML = '';
  }
}

async function handleSearch(q) {
  clearTimeout(searchTimer);
  const res = document.getElementById('searchResults');
  if (!q.trim()) { res.innerHTML = ''; return; }
  res.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">Searching...</div>';
  searchTimer = setTimeout(async () => {
    const data = await tmdb('/search/multi', { query: q, include_adult: false });
    const items = (data.results || []).filter(m => m.media_type !== 'person').slice(0, 12);
    if (!items.length) {
      res.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">No results found</div>';
      return;
    }
    res.innerHTML = items.map(m => buildCard(m, m.media_type || 'movie')).join('');
  }, 350);
}

// ─── FILTERS ────────────────────────────────
async function applyFilters() {
  const genre = document.getElementById('genreFilter').value;
  const year = document.getElementById('yearFilter').value;
  const lang = document.getElementById('langFilter').value;
  const sort = document.getElementById('sortFilter').value;

  const params = { sort_by: sort };
  if (genre) params.with_genres = genre;
  if (lang) params.with_original_language = lang;
  if (year) {
    if (year === '2015') { params['primary_release_date.gte'] = '2010-01-01'; params['primary_release_date.lte'] = '2015-12-31'; }
    else if (year === '2000') { params['primary_release_date.gte'] = '2000-01-01'; params['primary_release_date.lte'] = '2009-12-31'; }
    else if (year === '1990') { params['primary_release_date.gte'] = '1990-01-01'; params['primary_release_date.lte'] = '1999-12-31'; }
    else { params['primary_release_date.gte'] = `${year}-01-01`; params['primary_release_date.lte'] = `${year}-12-31`; }
  }

  showRowsContainer();
  const trendingRow = document.getElementById('trendingRow');
  trendingRow.innerHTML = Array(8).fill('').map(() => `<div class="skeleton skeleton-card"></div>`).join('');

  const data = await tmdb('/discover/movie', params);
  renderRow('trendingRow', data.results);
  document.querySelector('.row-header h2').textContent = '🔍 Filter Results';

  // scroll to rows
  document.getElementById('rowsContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function filterByCategory(cat) {
  currentCategory = cat;
  showRowsContainer();
  clearHeroTimer();

  const rowsContainer = document.getElementById('rowsContainer');
  rowsContainer.innerHTML = `
    <div class="row-section">
      <div class="row-header"><h2 id="catTitle">Loading...</h2></div>
      <div class="page-grid" id="catGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr));gap:16px">
        ${Array(20).fill('').map(() => `<div class="skeleton skeleton-card"></div>`).join('')}
      </div>
    </div>`;

  let endpoint, params = {}, title;

  switch (cat) {
    case 'movie':
      endpoint = '/movie/popular'; title = '🎬 Popular Movies'; break;
    case 'tv':
      endpoint = '/tv/popular'; title = '📺 Popular TV Shows'; params.type = 'tv'; break;
    case 'anime':
      endpoint = '/discover/tv';
      params = { with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc' };
      title = '🎌 Anime'; break;
    case 'cartoon':
      endpoint = '/discover/movie';
      params = { with_genres: '16', sort_by: 'popularity.desc' };
      title = '🎨 Cartoons & Animation'; break;
    case 'top_rated':
      endpoint = '/movie/top_rated'; title = '⭐ Top Rated Movies'; break;
    default:
      endpoint = '/movie/popular'; title = '🎬 Movies';
  }

  document.getElementById('catTitle').textContent = title;
  const type = ['tv', 'anime'].includes(cat) ? 'tv' : 'movie';
  const data = await tmdb(endpoint, params);

  const grid = document.getElementById('catGrid');
  if (!data.results?.length) {
    grid.innerHTML = '<p style="color:var(--text3)">Nothing found</p>';
    return;
  }
  grid.innerHTML = data.results.map(m => buildCard(m, type)).join('');
}

async function loadMoreTrending() {
  filterByCategory('movie');
}

// ─── MOVIE MODAL ────────────────────────────
async function openMovieModal(id, type = 'movie') {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Reset
  document.getElementById('modalTitle').textContent = 'Loading...';
  document.getElementById('modalOverview').textContent = '';
  document.getElementById('modalMeta').innerHTML = '';
  document.getElementById('modalCast').innerHTML = '';
  document.getElementById('modalSimilar').innerHTML = '';
  document.getElementById('modalInfoList').innerHTML = '';
  document.getElementById('modalPoster').src = '';
  document.getElementById('modalRating').textContent = '';
  document.getElementById('modalHeroBg').style.backgroundImage = '';

  // Fetch details + credits + trailer + similar
  const [details, credits, videos, similar] = await Promise.all([
    tmdb(`/${type}/${id}`),
    tmdb(`/${type}/${id}/credits`),
    tmdb(`/${type}/${id}/videos`),
    tmdb(`/${type}/${id}/similar`)
  ]);

  currentMovie = { ...details, type };

  const title = details.title || details.name || 'Unknown';
  const year = (details.release_date || details.first_air_date || '').slice(0, 4);
  const runtime = details.runtime ? `${Math.floor(details.runtime/60)}h ${details.runtime%60}m` : '';
  const rating = details.vote_average ? details.vote_average.toFixed(1) : '—';
  const genres = (details.genres || []).map(g => g.name);

  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalOverview').textContent = details.overview || 'No description available.';

  // Hero bg
  const bgUrl = backdrop(details.backdrop_path) || poster(details.poster_path, 'original');
  if (bgUrl) document.getElementById('modalHeroBg').style.backgroundImage = `url(${bgUrl})`;

  // Poster
  const pUrl = poster(details.poster_path, 'w342');
  if (pUrl) document.getElementById('modalPoster').src = pUrl;
  document.getElementById('modalRating').innerHTML = `⭐ ${rating}`;

  // Meta tags
  const metaEl = document.getElementById('modalMeta');
  metaEl.innerHTML = `
    ${year ? `<span class="meta-tag">${year}</span>` : ''}
    ${runtime ? `<span class="meta-tag">${runtime}</span>` : ''}
    <span class="meta-tag" style="color:var(--green);background:rgba(34,197,94,0.15)">HD Free</span>
    ${genres.slice(0,3).map(g => `<span class="meta-tag genre">${g}</span>`).join('')}
  `;

  // Info list
  const infoEl = document.getElementById('modalInfoList');
  infoEl.innerHTML = `
    <div class="info-row"><div class="info-label">Director</div>
      <div class="info-value">${credits.crew?.find(c=>c.job==='Director')?.name || '—'}</div></div>
    <div class="info-row"><div class="info-label">Language</div>
      <div class="info-value">${details.original_language?.toUpperCase() || '—'}</div></div>
    ${details.budget ? `<div class="info-row"><div class="info-label">Budget</div>
      <div class="info-value">$${(details.budget/1e6).toFixed(0)}M</div></div>` : ''}
    <div class="info-row"><div class="info-label">Votes</div>
      <div class="info-value">${(details.vote_count||0).toLocaleString()}</div></div>
    <div class="info-row"><div class="info-label">Status</div>
      <div class="info-value">${details.status || '—'}</div></div>
  `;

  // Cast
  const cast = (credits.cast || []).slice(0, 8);
  if (cast.length) {
    document.getElementById('modalCast').innerHTML = `
      <h3>Cast</h3>
      <div class="cast-list">
        ${cast.map(a => `
          <div class="cast-item">
            <img class="cast-photo" src="${poster(a.profile_path, 'w92') || ''}"
                 alt="${a.name}" loading="lazy"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 56 56\\'><circle cx=\\'28\\' cy=\\'28\\' r=\\'28\\' fill=\\'%231e1e2e\\'/><text x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'24\\'>👤</text></svg>'"/>
            <div class="cast-name">${a.name}</div>
          </div>`).join('')}
      </div>`;
  }

  // Trailer
  const trailer = (videos.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube')
    || (videos.results || [])[0];
  currentTrailerKey = trailer?.key || null;
  document.getElementById('trailerBtn').style.opacity = currentTrailerKey ? '1' : '0.4';

  // Similar
  const simItems = (similar.results || []).slice(0, 8);
  if (simItems.length) {
    document.getElementById('modalSimilar').innerHTML = `
      <h3>More Like This</h3>
      <div class="similar-grid">
        ${simItems.map(m => `
          <div class="similar-card" onclick="openMovieModal(${m.id},'${type}')">
            <img src="${poster(m.poster_path) || ''}" alt="${m.title || m.name}"
                 loading="lazy" onerror="this.style.background='var(--surface2)'"/>
          </div>`).join('')}
      </div>`;
  }

  // Watchlist button
  updateModalWatchlistBtn();

  // Save to history
  addToHistory({ id: details.id, title, poster_path: details.poster_path, type, vote_average: details.vote_average, release_date: details.release_date });
}

function updateModalWatchlistBtn() {
  if (!currentMovie) return;
  const btn = document.getElementById('modalWatchlistBtn');
  const icon = document.getElementById('watchlistIcon');
  const inList = watchlist.some(w => w.id === currentMovie.id);
  btn.classList.toggle('active', inList);
  icon.innerHTML = inList
    ? '<polyline points="20,6 9,17 4,12"/>'
    : '<path d="M12 5v14M5 12h14"/>';
}

function toggleModalWatchlist() {
  if (!currentMovie) return;
  toggleWatchlistItem(currentMovie, currentMovie.type || 'movie');
  updateModalWatchlistBtn();
}

function closeModal(e) {
  if (e.target === document.getElementById('modalOverlay')) closeMovieModal();
}

function closeMovieModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ─── PLAYER ─────────────────────────────────
function openPlayerForMovie(id, type, title) {
  currentPlayerSource = 'vidsrc';
  document.getElementById('playerTitle').textContent = title || 'Now Playing';
  document.getElementById('sourceSelect').value = 'vidsrc';
  loadPlayerSource(id, type, 'vidsrc');
  document.getElementById('playerOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  isPlaying = true;
  startFakeProgress();

  // Save to continue watching
  const movie = currentMovie || { id, title, type };
  addToContinueWatching({ id, title: title || 'Unknown', poster_path: currentMovie?.poster_path, type, progress: 0 });
}

function openPlayer() {
  if (!currentMovie) return;
  const id = currentMovie.id;
  const type = currentMovie.type || 'movie';
  const title = currentMovie.title || currentMovie.name;
  closeMovieModal();
  setTimeout(() => openPlayerForMovie(id, type, title), 100);
}

function loadPlayerSource(id, type, source) {
  const iframe = document.getElementById('playerIframe');
  const loading = document.getElementById('playerLoading');
  loading.style.display = 'flex';
  iframe.src = '';
  setTimeout(() => {
    const url = SOURCES[source]?.(id, type) || SOURCES.vidsrc(id, type);
    iframe.src = url;
    iframe.onload = () => { loading.style.display = 'none'; setTimeout(() => setVolume(savedVolume), 250); };
    // Store movie id/type for source switching
    iframe.dataset.movieId = id;
    iframe.dataset.movieType = type;
  }, 300);
}

function changeSource(source) {
  const iframe = document.getElementById('playerIframe');
  const id = iframe.dataset.movieId;
  const type = iframe.dataset.movieType;
  if (id) loadPlayerSource(id, type, source);
}

function closePlayer() {
  document.getElementById('playerOverlay').classList.remove('open');
  document.getElementById('playerIframe').src = '';
  document.body.style.overflow = '';
  clearInterval(progressInterval);
  fakeProgress = 0;
  updateProgress(0);
  // Update continue watching progress
  if (currentMovie) {
    const item = continueWatching.find(c => c.id === currentMovie.id);
    if (item) {
      item.progress = Math.min(95, fakeProgress);
      saveContinue();
    }
  }
}

function togglePlayPause() {
  isPlaying = !isPlaying;
  const icon = document.getElementById('playIcon');
  if (isPlaying) {
    icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    startFakeProgress();
  } else {
    icon.innerHTML = '<polygon points="5,3 19,12 5,21"/>';
    clearInterval(progressInterval);
  }
}

function startFakeProgress() {
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (fakeProgress < 99) {
      fakeProgress += 0.1;
      updateProgress(fakeProgress);
    }
  }, 1000);
}

function updateProgress(pct) {
  document.getElementById('progressFill').style.width = `${pct}%`;
  document.getElementById('progressThumb').style.left = `${pct}%`;
  const total = 7200; // fake 2hr total
  const curr = (total * pct / 100) | 0;
  document.getElementById('currentTime').textContent = formatTime(curr);
  document.getElementById('totalTime').textContent = formatTime(total);
}

function formatTime(s) {
  const h = (s / 3600) | 0;
  const m = ((s % 3600) / 60) | 0;
  const ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}` : `${m}:${String(ss).padStart(2,'0')}`;
}

function seekVideo(e) {
  const bar = e.currentTarget;
  const pct = (e.offsetX / bar.offsetWidth) * 100;
  fakeProgress = Math.max(0, Math.min(99, pct));
  updateProgress(fakeProgress);
}

function skipBack() { fakeProgress = Math.max(0, fakeProgress - 0.23); updateProgress(fakeProgress); toast('⏪ -10s'); }
function skipForward() { fakeProgress = Math.min(99, fakeProgress + 0.23); updateProgress(fakeProgress); toast('⏩ +10s'); }

function updateVolumeIcon() {
  const icon = document.getElementById('volIcon');
  const v = isMuted ? 0 : Number(document.getElementById('volumeSlider')?.value || 0);
  if (!icon) return;
  if (v === 0) {
    icon.innerHTML = '<polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  } else if (v < 50) {
    icon.innerHTML = '<polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15 10a3 3 0 0 1 0 4"/>';
  } else {
    icon.innerHTML = '<polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>';
  }
}

function sendVolumeToPlayer(volume) {
  const iframe = document.getElementById('playerIframe');
  if (!iframe) return;
  // Native video/audio, when an embed exposes one.
  try {
    const doc = iframe.contentDocument;
    const media = doc && doc.querySelector('video, audio');
    if (media) media.volume = volume / 100;
  } catch (_) {}
  // Common iframe players may accept these postMessage commands. Cross-origin
  // players are free to ignore them; their own controls remain authoritative.
  try { iframe.contentWindow?.postMessage(JSON.stringify({event:'command', func:'setVolume', args:[volume]}), '*'); } catch (_) {}
  try { iframe.contentWindow?.postMessage({event:'command', func:'setVolume', args:[volume]}, '*'); } catch (_) {}
}

function toggleMute() {
  const slider = document.getElementById('volumeSlider');
  if (!slider) return;
  isMuted = !isMuted;
  if (isMuted) {
    lastVolume = Number(slider.value) || 100;
    slider.value = 0;
    sendVolumeToPlayer(0);
  } else {
    slider.value = String(lastVolume || 100);
    sendVolumeToPlayer(lastVolume || 100);
  }
  updateVolumeIcon();
}

function setVolume(v) {
  v = Math.max(0, Math.min(100, Number(v) || 0));
  const slider = document.getElementById('volumeSlider');
  if (slider) slider.value = String(v);
  isMuted = v === 0;
  if (v > 0) { lastVolume = v; localStorage.setItem('movienova_volume', String(v)); }
  sendVolumeToPlayer(v);
  updateVolumeIcon();
}

function setSpeed(s) {
  currentSpeed = s;
  document.getElementById('speedLabel').textContent = `${s}×`;
  document.querySelectorAll('.speed-menu button').forEach(b => {
    b.classList.toggle('active', b.textContent === `${s}×`);
  });
  closeSpeedMenu();
  toast(`Speed: ${s}×`);
}

function toggleSpeedMenu() {
  document.getElementById('speedMenu').classList.toggle('open');
}

function closeSpeedMenu() {
  document.getElementById('speedMenu').classList.remove('open');
}

function toggleSubs() {
  subsEnabled = !subsEnabled;
  const btn = document.getElementById('subsBtn');
  const wrap = document.getElementById('subLangWrap');
  btn.classList.toggle('active', subsEnabled);
  wrap.style.display = subsEnabled ? 'flex' : 'none';
  toast(subsEnabled ? '✓ Subtitles on' : 'Subtitles off');
}

function changeSubLang(lang) {
  toast(`Subtitles: ${document.getElementById('subLang').options[document.getElementById('subLang').selectedIndex].text}`);
}

function toggleFullscreen() {
  const el = document.getElementById('playerContainer');
  if (!document.fullscreenElement) {
    el.requestFullscreen?.();
    document.getElementById('fsIcon').innerHTML = '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>';
  } else {
    document.exitFullscreen?.();
    document.getElementById('fsIcon').innerHTML = '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>';
  }
}

function togglePiP() {
  const iframe = document.getElementById('playerIframe');
  try {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else {
      toast('📺 PiP: right-click the video for Picture-in-Picture', 'info');
    }
  } catch { toast('PiP not available for this source', 'error'); }
}

// ─── TRAILER ────────────────────────────────
function openTrailer() {
  if (!currentTrailerKey) { toast('No trailer available', 'error'); return; }
  document.getElementById('trailerFrame').src = `https://www.youtube.com/embed/${currentTrailerKey}?autoplay=1`;
  document.getElementById('trailerOverlay').classList.add('open');
}

function closeTrailer(e) {
  if (e.target === document.getElementById('trailerOverlay')) closeTrailerModal();
}

function closeTrailerModal() {
  document.getElementById('trailerOverlay').classList.remove('open');
  document.getElementById('trailerFrame').src = '';
}

// ─── WATCHLIST ──────────────────────────────
function toggleWatchlistItem(movie, type) {
  const idx = watchlist.findIndex(w => w.id === movie.id);
  if (idx === -1) {
    watchlist.push({ id: movie.id, title: movie.title || movie.name, poster_path: movie.poster_path, type, vote_average: movie.vote_average });
    toast(`❤️ Added to watchlist`);
  } else {
    watchlist.splice(idx, 1);
    toast(`Removed from watchlist`);
  }
  localStorage.setItem('mn_watchlist', JSON.stringify(watchlist));
  // Update card buttons
  updateCardWatchlistBtn(movie.id, idx === -1);
}

function toggleWatchlistCard(id, type, btn) {
  // Find movie from DOM or build minimal object
  const inList = watchlist.some(w => w.id === id);
  const mockMovie = { id, type };
  toggleWatchlistItem(mockMovie, type);
  const nowIn = watchlist.some(w => w.id === id);
  btn.textContent = nowIn ? '✓' : '+';
  btn.classList.toggle('in-list', nowIn);
}

function updateCardWatchlistBtn(id, inList) {
  const btn = document.getElementById(`wl${id}`);
  if (!btn) return;
  btn.textContent = inList ? '✓' : '+';
  btn.classList.toggle('in-list', inList);
}

function showWatchlist() {
  clearHeroTimer();
  document.getElementById('heroSection').style.display = 'none';
  document.getElementById('filtersBar').style.display = 'none';
  showRowsContainer();

  const container = document.getElementById('rowsContainer');
  if (!watchlist.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">❤️</div>
        <h3>Your watchlist is empty</h3>
        <p>Browse movies and click + to save them here</p>
      </div>`;
    return;
  }
  container.innerHTML = `
    <div style="padding-bottom:32px">
      <h1 style="font-size:28px;font-weight:800;margin-bottom:8px">❤️ My Watchlist</h1>
      <p style="color:var(--text2);margin-bottom:24px">${watchlist.length} title${watchlist.length !== 1 ? 's' : ''} saved</p>
      <div class="page-grid">${watchlist.map(m => buildCard(m, m.type || 'movie')).join('')}</div>
    </div>`;
}

function showHistory() {
  clearHeroTimer();
  document.getElementById('heroSection').style.display = 'none';
  document.getElementById('filtersBar').style.display = 'none';
  showRowsContainer();

  const container = document.getElementById('rowsContainer');
  if (!history_.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📌</div>
        <h3>No watch history yet</h3>
        <p>Movies you view will appear here</p>
      </div>`;
    return;
  }
  const unique = [...new Map(history_.map(m => [m.id, m])).values()].slice(0, 50);
  container.innerHTML = `
    <div style="padding-bottom:32px">
      <h1 style="font-size:28px;font-weight:800;margin-bottom:8px">📌 Watch History</h1>
      <p style="color:var(--text2);margin-bottom:24px">${unique.length} title${unique.length !== 1 ? 's' : ''}</p>
      <div class="page-grid">${unique.map(m => buildCard(m, m.type || 'movie')).join('')}</div>
    </div>`;
}

function showContinueWatching() {
  clearHeroTimer();
  document.getElementById('heroSection').style.display = 'none';
  document.getElementById('filtersBar').style.display = 'none';
  showRowsContainer();

  const container = document.getElementById('rowsContainer');
  if (!continueWatching.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">▶️</div>
        <h3>Nothing to continue</h3>
        <p>Start watching a movie to see it here</p>
      </div>`;
    return;
  }
  container.innerHTML = `
    <div style="padding-bottom:32px">
      <h1 style="font-size:28px;font-weight:800;margin-bottom:8px">▶️ Continue Watching</h1>
      <p style="color:var(--text2);margin-bottom:24px">${continueWatching.length} title${continueWatching.length !== 1 ? 's' : ''}</p>
      <div class="page-grid">${continueWatching.map(m => buildCard(m, m.type || 'movie')).join('')}</div>
    </div>`;
}

function addToHistory(movie) {
  history_.unshift(movie);
  if (history_.length > 100) history_ = history_.slice(0, 100);
  localStorage.setItem('mn_history', JSON.stringify(history_));
}

function addToContinueWatching(movie) {
  const idx = continueWatching.findIndex(c => c.id === movie.id);
  if (idx !== -1) continueWatching.splice(idx, 1);
  continueWatching.unshift(movie);
  if (continueWatching.length > 20) continueWatching = continueWatching.slice(0, 20);
  saveContinue();
  initContinueWatching();
}

function saveContinue() {
  localStorage.setItem('mn_continue', JSON.stringify(continueWatching));
}

function initContinueWatching() {
  const section = document.getElementById('continueSection');
  const row = document.getElementById('continueRow');
  if (!continueWatching.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  row.innerHTML = continueWatching.map(m => buildCard(m, m.type || 'movie')).join('');
}

// ─── HOME ────────────────────────────────────
function showHome() {
  currentCategory = null;
  document.getElementById('heroSection').style.display = '';
  document.getElementById('filtersBar').style.display = '';
  showRowsContainer();

  // Restore rows
  const container = document.getElementById('rowsContainer');
  container.innerHTML = `
    <div class="row-section" id="continueSection" style="display:none">
      <div class="row-header"><h2>Continue Watching</h2></div>
      <div class="row-scroll" id="continueRow"></div>
    </div>
    <div class="row-section">
      <div class="row-header"><h2>🔥 Trending This Week</h2><a href="#" onclick="loadMoreTrending()">See All</a></div>
      <div class="row-scroll" id="trendingRow"></div>
    </div>
    <div class="row-section">
      <div class="row-header"><h2>⭐ Top Rated Movies</h2><a href="#" onclick="filterByCategory('top_rated')">See All</a></div>
      <div class="row-scroll" id="topRatedRow"></div>
    </div>
    <div class="row-section">
      <div class="row-header"><h2>🎌 Anime</h2><a href="#" onclick="filterByCategory('anime')">See All</a></div>
      <div class="row-scroll" id="animeRow"></div>
    </div>
    <div class="row-section">
      <div class="row-header"><h2>🎨 Cartoons & Animation</h2><a href="#" onclick="filterByCategory('cartoon')">See All</a></div>
      <div class="row-scroll" id="cartoonRow"></div>
    </div>
    <div class="row-section">
      <div class="row-header"><h2>📺 Popular TV Shows</h2><a href="#" onclick="filterByCategory('tv')">See All</a></div>
      <div class="row-scroll" id="tvRow"></div>
    </div>
    <div class="row-section">
      <div class="row-header"><h2>🆕 Recently Added</h2></div>
      <div class="row-scroll" id="recentRow"></div>
    </div>
    <div class="row-section">
      <div class="row-header"><h2>💥 Action & Adventure</h2></div>
      <div class="row-scroll" id="actionRow"></div>
    </div>
    <div class="row-section">
      <div class="row-header"><h2>😂 Comedy</h2></div>
      <div class="row-scroll" id="comedyRow"></div>
    </div>
    <div class="row-section">
      <div class="row-header"><h2>🌌 Sci-Fi & Fantasy</h2></div>
      <div class="row-scroll" id="scifiRow"></div>
    </div>`;

  if (heroMovies.length) setupHero(heroMovies);
  loadAllRows();
  initContinueWatching();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showRowsContainer() {
  // noop — container always visible
}

// ─── RANDOM MOVIE ────────────────────────────
async function randomMovie() {
  toast('🎲 Finding random movie...', 'info');
  const page = Math.floor(Math.random() * 50) + 1;
  const data = await tmdb('/movie/popular', { page });
  const movies = data.results || [];
  if (!movies.length) { toast('Nothing found', 'error'); return; }
  const movie = movies[Math.floor(Math.random() * movies.length)];
  openMovieModal(movie.id, 'movie');
}

// ─── SHARE ──────────────────────────────────
function shareMovie() {
  if (!currentMovie) return;
  const title = currentMovie.title || currentMovie.name;
  const text = `Check out "${title}" on MovieNova!`;
  const url = `https://movienova.vercel.app/#movie/${currentMovie.id}`;
  if (navigator.share) {
    navigator.share({ title, text, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => toast('🔗 Link copied!'));
  }
}

// ─── THEME ──────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('mn_theme', isDark ? 'light' : 'dark');
  const btn = document.getElementById('themeBtn');
  btn.innerHTML = isDark
    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  toast(isDark ? '☀️ Light mode' : '🌙 Dark mode');
}

// Load saved theme
(() => {
  const t = localStorage.getItem('mn_theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
})();

// ─── NOTIFICATIONS ──────────────────────────
function renderNotifications() {
  const list = document.getElementById('notifList');
  list.innerHTML = notificationsData.map(n => `
    <div class="notif-item">
      <div class="notif-item-icon">${n.icon}</div>
      <div class="notif-item-text"><strong>${n.title}</strong>${n.text}</div>
    </div>`).join('');
}

function toggleNotifications() {
  document.getElementById('notifPanel').classList.toggle('open');
  document.getElementById('userMenu').classList.remove('open');
  document.getElementById('notifBadge').style.display = 'none';
}

function clearNotifs() {
  notificationsData = [];
  renderNotifications();
  document.getElementById('notifPanel').innerHTML = `
    <div class="notif-header"><h3>Notifications</h3></div>
    <div style="padding:32px;text-align:center;color:var(--text3);font-size:14px">All caught up! 🎉</div>`;
}

function toggleUserMenu() {
  document.getElementById('userMenu').classList.toggle('open');
  document.getElementById('notifPanel').classList.remove('open');
}

// ─── MOBILE NAV ─────────────────────────────
function toggleMobileNav() {
  document.getElementById('navLinks').classList.toggle('mobile-open');
}

function setActive(el) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  el.classList.add('active');
}

// ─── TOAST ──────────────────────────────────
function toast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.style.opacity = '0', 2700);
  setTimeout(() => t.remove(), 3000);
}

// ─── UTILS ──────────────────────────────────
function clearHeroTimer() { clearInterval(heroTimer); }

// Close dropdowns on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#notifPanel') && !e.target.closest('.notif-btn')) {
    document.getElementById('notifPanel').classList.remove('open');
  }
  if (!e.target.closest('#userMenu') && !e.target.closest('.user-btn')) {
    document.getElementById('userMenu').classList.remove('open');
  }
  if (!e.target.closest('#speedMenu') && !e.target.closest('.speed-wrap')) {
    closeSpeedMenu();
  }
  if (!e.target.closest('#navLinks') && !e.target.closest('#hamburger')) {
    document.getElementById('navLinks').classList.remove('mobile-open');
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (document.getElementById('playerOverlay').classList.contains('open')) {
    if (e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
    if (e.code === 'ArrowRight') skipForward();
    if (e.code === 'ArrowLeft') skipBack();
    if (e.code === 'KeyF') toggleFullscreen();
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'Escape') closePlayer();
  }
  if (e.code === 'Escape') {
    closeMovieModal();
    closeTrailerModal();
    const sb = document.getElementById('searchBar');
    if (sb.classList.contains('open')) toggleSearch();
  }
});

// Sidebar genre helper for the redesigned MovieNova home.
function setGenreAndHome(genreId) {
  const filter = document.getElementById('genreFilter');
  if (filter) filter.value = genreId;
  if (typeof applyFilters === 'function') applyFilters();
}


// MovieNova volume boost: works when the embedded player exposes a native
// HTMLMediaElement. Cross-origin iframe players may block this control.
let volumeBoost = Number(localStorage.getItem('movienova_boost') || 1);

function applyVolumeBoost() {
  const media = document.querySelector('video, audio');
  if (media) {
    media.volume = Math.min(1, (Number(document.getElementById('volumeSlider')?.value || 100) / 100) * volumeBoost);
  }
}

function setBoost(v) {
  volumeBoost = Math.max(1, Math.min(2, Number(v) || 1));
  localStorage.setItem('movienova_boost', volumeBoost);
  const label = document.getElementById('boostValue');
  if (label) label.textContent = Math.round(volumeBoost * 100) + '%';
  applyVolumeBoost();
}

function toggleBoost() {
  setBoost(volumeBoost >= 2 ? 1 : 2);
}

document.addEventListener('DOMContentLoaded', () => {
  const label = document.getElementById('boostValue');
  if (label) label.textContent = Math.round(volumeBoost * 100) + '%';
});
