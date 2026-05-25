// ═══════════════════════════════════════════════════════════
//  Free Movies — app.js
//  TMDB API v3 + vidsrc.to player
// ═══════════════════════════════════════════════════════════

const TMDB_KEY  = '3c196a8fcc1be7712e629804b4d03228';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG       = 'https://image.tmdb.org/t/p';
const EMBED     = 'https://vidsrcme.ru';

// ── STATE ────────────────────────────────────────────────────
const S = {
  view:           'home',   // home | browse | search | detail | player
  tab:            null,     // movies | series | anime
  browsePage:     1,
  browseTotal:    1,
  browseGenre:    '',
  browseYear:     '',
  browseSort:     'popularity.desc',
  searchQ:        '',
  searchPage:     1,
  searchTotal:    1,
  detailItem:     null,
  detailType:     null,
  playerItem:     null,
  playerType:     null,
  playerSeason:   null,
  playerEpisode:  null,
  playerEps:      [],
  heroItems:      [],
  heroIdx:        0,
  heroTimer:      null,
};

const MOVIE_GENRES = {};
const TV_GENRES    = {};

// ── BOOT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  window.addEventListener('scroll', onScroll);
  document.getElementById('searchInput').addEventListener('input', onSearchInput);
  await Promise.all([fetchMovieGenres(), fetchTvGenres()]);
  populateYearFilter();
  loadHome();
});

function onScroll() {
  document.getElementById('navbar')
    .classList.toggle('scrolled', window.scrollY > 10);
}

// ── TMDB FETCH ────────────────────────────────────────────────
async function api(endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', TMDB_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v != null) url.searchParams.set(k, v);
  }
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json();
}

async function fetchMovieGenres() {
  const d = await api('/genre/movie/list');
  d.genres.forEach(g => { MOVIE_GENRES[g.id] = g.name; });
}
async function fetchTvGenres() {
  const d = await api('/genre/tv/list');
  d.genres.forEach(g => { TV_GENRES[g.id] = g.name; });
}

function populateYearFilter() {
  const sel = document.getElementById('yearFilter');
  const cur = new Date().getFullYear();
  for (let y = cur; y >= 1970; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    sel.appendChild(o);
  }
}

// ── HOME ─────────────────────────────────────────────────────
async function loadHome() {
  setView('home');
  showHero(true);
  loading(true);
  try {
    const [trending, movies, series, anime] = await Promise.all([
      api('/trending/all/week'),
      api('/movie/popular'),
      api('/tv/popular'),
      api('/discover/tv', {
        with_genres: '16',
        sort_by: 'popularity.desc',
        with_original_language: 'ja',
      }),
    ]);

    // hero from trending
    S.heroItems = trending.results
      .filter(i => i.backdrop_path)
      .slice(0, 6);
    buildHero(0);
    buildHeroDots();

    renderRow('trendingRow', trending.results.slice(0, 18), 'auto');
    renderRow('moviesRow',   movies.results.slice(0, 18),   'movie');
    renderRow('seriesRow',   series.results.slice(0, 18),   'tv');
    renderRow('animeRow',    anime.results.slice(0, 18),    'tv', true);
  } catch(e) { console.error(e); }
  loading(false);
}

// ── HERO ─────────────────────────────────────────────────────
function buildHero(idx) {
  clearTimeout(S.heroTimer);
  S.heroIdx = idx;
  const item = S.heroItems[idx];
  if (!item) return;

  const type  = item.media_type || 'movie';
  const title = item.title || item.name || '';
  const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : '';
  const desc  = item.overview || '';

  document.getElementById('heroBg').style.backgroundImage =
    item.backdrop_path ? `url(${IMG}/w1280${item.backdrop_path})` : 'none';
  document.getElementById('heroTitle').textContent = title;
  document.getElementById('heroDesc').textContent  = desc;
  document.getElementById('heroMeta').innerHTML =
    `${rating ? `<span class="rating">★ ${rating}</span>` : ''}
     ${year ? `<span>${year}</span>` : ''}
     <span>${type === 'movie' ? 'Movie' : 'Series'}</span>`;

  document.getElementById('heroPlayBtn').onclick = () => {
    if (type === 'movie') playMovie(item.id);
    else playEpisode(item.id, 1, 1);
  };
  document.getElementById('heroInfoBtn').onclick = () =>
    openDetail(item.id, type);

  // update dots
  document.querySelectorAll('.hero-dot').forEach((d, i) =>
    d.classList.toggle('active', i === idx));

  S.heroTimer = setTimeout(() =>
    buildHero((idx + 1) % S.heroItems.length), 6000);
}

function buildHeroDots() {
  const wrap = document.getElementById('heroDots');
  wrap.innerHTML = S.heroItems.map((_, i) =>
    `<div class="hero-dot${i===0?' active':''}" onclick="buildHero(${i})"></div>`
  ).join('');
}

// ── TABS ─────────────────────────────────────────────────────
function switchTab(tab) {
  S.tab        = tab;
  S.browsePage = 1;
  S.browseGenre = '';
  S.browseYear  = '';
  S.browseSort  = 'popularity.desc';
  document.getElementById('genreFilter').value = '';
  document.getElementById('yearFilter').value  = '';
  document.getElementById('sortFilter').value  = 'popularity.desc';
  setActiveTab(tab);
  populateGenreFilter(tab);
  showHero(false);
  loadBrowse();
}

function setActiveTab(tab) {
  document.querySelectorAll('.nav-link').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === tab));
}

function populateGenreFilter(tab) {
  const sel = document.getElementById('genreFilter');
  sel.innerHTML = '<option value="">All Genres</option>';
  const map = tab === 'movies' ? MOVIE_GENRES : TV_GENRES;
  Object.entries(map)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([id, name]) => {
      const o = document.createElement('option');
      o.value = id; o.textContent = name;
      sel.appendChild(o);
    });
}

// ── BROWSE ───────────────────────────────────────────────────
async function loadBrowse() {
  setView('browse');
  loading(true);
  const labels = { movies: 'Movies', series: 'Series', anime: 'Anime' };
  document.getElementById('browseTitle').textContent = labels[S.tab] || '';
  document.getElementById('pageInfo').textContent = `Page ${S.browsePage}`;

  try {
    let data;
    if (S.tab === 'movies') {
      data = await api('/discover/movie', {
        sort_by:              S.browseSort,
        with_genres:          S.browseGenre,
        primary_release_year: S.browseYear,
        page:                 S.browsePage,
        'vote_count.gte':     30,
      });
      renderGrid('browseGrid', data.results, 'movie');
    } else if (S.tab === 'series') {
      data = await api('/discover/tv', {
        sort_by:             S.browseSort,
        with_genres:         S.browseGenre,
        first_air_date_year: S.browseYear,
        page:                S.browsePage,
        without_genres:      '16',
        'vote_count.gte':    10,
      });
      renderGrid('browseGrid', data.results, 'tv');
    } else {
      // anime
      data = await api('/discover/tv', {
        sort_by:                 S.browseSort,
        with_genres:             S.browseGenre || '16',
        first_air_date_year:     S.browseYear,
        page:                    S.browsePage,
        with_original_language:  'ja',
        'vote_count.gte':        5,
      });
      renderGrid('browseGrid', data.results, 'tv', true);
    }
    S.browseTotal = Math.min(data.total_pages, 500);
    document.getElementById('pageInfo').textContent =
      `Page ${S.browsePage} / ${S.browseTotal}`;
  } catch(e) { console.error(e); }
  loading(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function applyFilters() {
  S.browseGenre = document.getElementById('genreFilter').value;
  S.browseYear  = document.getElementById('yearFilter').value;
  S.browseSort  = document.getElementById('sortFilter').value;
  S.browsePage  = 1;
  loadBrowse();
}

function changePage(dir) {
  const n = S.browsePage + dir;
  if (n < 1 || n > S.browseTotal) return;
  S.browsePage = n;
  loadBrowse();
}

// ── SEARCH ───────────────────────────────────────────────────
function onSearchInput(e) {
  const v = e.target.value;
  document.getElementById('searchClear').style.display = v ? '' : 'none';
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  showHome();
}

function doSearch() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return;
  S.searchQ    = q;
  S.searchPage = 1;
  showHero(false);
  setActiveTab(null);
  fetchSearch();
}

async function fetchSearch() {
  setView('search');
  loading(true);
  document.getElementById('searchTitle').textContent =
    `Results for "${S.searchQ}"`;
  try {
    const data = await api('/search/multi', {
      query: S.searchQ,
      page:  S.searchPage,
    });
    const results = data.results.filter(r =>
      r.media_type === 'movie' || r.media_type === 'tv'
    );
    S.searchTotal = Math.min(data.total_pages, 500);
    document.getElementById('searchPageInfo').textContent =
      `Page ${S.searchPage} / ${S.searchTotal}`;
    document.getElementById('sPrev').disabled = S.searchPage <= 1;
    document.getElementById('sNext').disabled = S.searchPage >= S.searchTotal;
    renderGrid('searchGrid', results, 'auto');
  } catch(e) { console.error(e); }
  loading(false);
}

function changeSearchPage(dir) {
  const n = S.searchPage + dir;
  if (n < 1 || n > S.searchTotal) return;
  S.searchPage = n;
  fetchSearch();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  showHome();
}

// ── RENDER HELPERS ────────────────────────────────────────────
function renderRow(id, items, typeHint, isAnime = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = items.map(i => card(i, typeHint, isAnime)).join('');
}

function renderGrid(id, items, typeHint, isAnime = false) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!items?.length) {
    el.innerHTML = `<div class="empty"><div class="icon">🎬</div>
      <h3>Nothing found</h3><p>Try different filters.</p></div>`;
    return;
  }
  el.innerHTML = items.map(i => card(i, typeHint, isAnime)).join('');
}

function card(item, typeHint, isAnime = false) {
  const type   = typeHint === 'auto' ? (item.media_type || 'movie') : typeHint;
  const title  = esc(item.title || item.name || 'Unknown');
  const year   = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : '—';
  const poster = item.poster_path
    ? `<img src="${IMG}/w300${item.poster_path}" alt="${title}" loading="lazy" />`
    : `<div class="card-poster-placeholder">🎬</div>`;

  const badgeClass = isAnime ? 'anime' : type === 'movie' ? 'movie' : 'series';
  const badgeLabel = isAnime ? 'Anime' : type === 'movie' ? 'Movie' : 'Series';

  return `
    <div class="card" onclick="openDetail(${item.id},'${type}',${isAnime})">
      <div class="card-poster-wrap">
        ${poster}
        <div class="card-overlay">
          <div style="width:100%;text-align:center">
            <div class="card-play-icon">▶</div>
          </div>
        </div>
        <span class="card-badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <div class="card-info">
        <div class="card-title">${title}</div>
        <div class="card-meta">
          <span class="card-rating">★ ${rating}</span>
          ${year ? `<span>${year}</span>` : ''}
        </div>
      </div>
    </div>`;
}

// ── DETAIL ───────────────────────────────────────────────────
async function openDetail(id, type, isAnime = false) {
  setView('detail');
  showHero(false);
  loading(true);

  try {
    const item = await api(`/${type}/${id}`, { append_to_response: 'credits,videos' });
    S.detailItem = item;
    S.detailType = type;

    const title   = esc(item.title || item.name || '');
    const year    = (item.release_date || item.first_air_date || '').slice(0, 4);
    const rating  = item.vote_average ? item.vote_average.toFixed(1) : '—';
    const overview = esc(item.overview || 'No description available.');
    const tagline  = item.tagline ? `<p class="detail-tagline">"${esc(item.tagline)}"</p>` : '';
    const genres   = (item.genres || []).map(g =>
      `<span class="chip genre">${esc(g.name)}</span>`).join('');
    const runtime  = item.runtime
      ? `<span class="chip info">${item.runtime} min</span>` : '';
    const seasons  = item.number_of_seasons
      ? `<span class="chip info">${item.number_of_seasons} Season${item.number_of_seasons > 1 ? 's' : ''}</span>` : '';

    const poster = item.poster_path
      ? `<div class="detail-poster"><img src="${IMG}/w400${item.poster_path}" alt="${title}" /></div>`
      : `<div class="detail-poster-ph">🎬</div>`;

    const playBtn = type === 'movie'
      ? `<button class="btn-play" onclick="playMovie(${item.id})">▶ Watch Now</button>`
      : `<button class="btn-play" onclick="playEpisode(${item.id},1,1)">▶ Watch S1 E1</button>`;

    let seasonsHtml = '';
    if (type === 'tv' && item.seasons?.length) {
      const real = item.seasons.filter(s => s.season_number > 0);
      const tabs = real.map(s =>
        `<button class="s-tab${s.season_number === 1 ? ' active' : ''}"
          onclick="loadSeason(${item.id},${s.season_number},this)">
          S${pad(s.season_number)}</button>`
      ).join('');
      seasonsHtml = `
        <div class="seasons-wrap">
          <h3>Episodes</h3>
          <div class="season-tabs">${tabs}</div>
          <div class="ep-grid" id="epGrid">
            <div class="loader-ring" style="margin:32px auto;"></div>
          </div>
        </div>`;
    }

    document.getElementById('detailView').innerHTML = `
      <div class="detail-wrap">
        <div class="detail-back" onclick="goBack()">← Back</div>
        <div class="detail-hero">
          ${poster}
          <div class="detail-info">
            <h1 class="detail-title">
              ${title}
              ${year ? `<span class="detail-year">(${year})</span>` : ''}
            </h1>
            ${tagline}
            <div class="detail-chips">
              <span class="chip rating">★ ${rating}</span>
              ${runtime}${seasons}${genres}
            </div>
            <p class="detail-overview">${overview}</p>
            <div class="detail-actions">${playBtn}</div>
          </div>
        </div>
        ${seasonsHtml}
      </div>`;

    if (type === 'tv' && item.seasons?.length) {
      loadSeason(item.id, 1, null);
    }
  } catch(e) {
    console.error(e);
    document.getElementById('detailView').innerHTML =
      `<div class="empty"><div class="icon">⚠️</div>
       <h3>Failed to load</h3><p>${e.message}</p></div>`;
  }
  loading(false);
}

async function loadSeason(seriesId, num, btnEl) {
  document.querySelectorAll('.s-tab').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  else document.querySelector('.s-tab')?.classList.add('active');

  const grid = document.getElementById('epGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="loader-ring" style="margin:32px auto;"></div>';

  try {
    const data = await api(`/tv/${seriesId}/season/${num}`);
    const eps  = data.episodes || [];
    if (!eps.length) {
      grid.innerHTML = '<p style="color:var(--text2);padding:16px">No episodes found.</p>';
      return;
    }
    grid.innerHTML = eps.map(ep => {
      const thumb = ep.still_path
        ? `<img src="${IMG}/w300${ep.still_path}" alt="E${ep.episode_number}" loading="lazy" />`
        : `<div class="ep-thumb-ph">▶</div>`;
      return `
        <div class="ep-card" onclick="playEpisode(${seriesId},${num},${ep.episode_number})">
          <div class="ep-thumb">${thumb}</div>
          <div class="ep-info">
            <div class="ep-num">S${pad(num)} E${pad(ep.episode_number)}</div>
            <div class="ep-title">${esc(ep.name || 'Episode ' + ep.episode_number)}</div>
            <div class="ep-desc">${esc(ep.overview || '')}</div>
          </div>
        </div>`;
    }).join('');
  } catch(e) {
    grid.innerHTML = '<p style="color:var(--text2);padding:16px">Failed to load episodes.</p>';
  }
}

// ── PLAYER ───────────────────────────────────────────────────
function playMovie(tmdbId) {
  const item  = S.detailItem;
  const title = esc(item?.title || item?.name || 'Movie');
  S.playerItem    = item;
  S.playerType    = 'movie';
  S.playerSeason  = null;
  S.playerEpisode = null;
  S.playerEps     = [];
  const src = `${EMBED}/embed/movie?tmdb=${tmdbId}`;
  renderPlayer(src, title, null, null, null);
}

async function playEpisode(seriesId, season, episode) {
  const item  = S.detailItem;
  const title = esc(item?.name || item?.title || 'Series');
  S.playerItem    = item;
  S.playerType    = 'tv';
  S.playerSeason  = season;
  S.playerEpisode = episode;

  try {
    const data = await api(`/tv/${seriesId}/season/${season}`);
    S.playerEps = data.episodes || [];
  } catch(e) { S.playerEps = []; }

  const label = `${title} — S${pad(season)} E${pad(episode)}`;
  const src = `${EMBED}/embed/tv?tmdb=${seriesId}&season=${season}&episode=${episode}`;
  renderPlayer(src, label, seriesId, season, episode);
}

function renderPlayer(src, title, seriesId, season, episode) {
  setView('player');
  showHero(false);

  const isTV  = S.playerType === 'tv';
  const eps   = S.playerEps;
  const idx   = isTV ? eps.findIndex(e => e.episode_number === episode) : -1;
  const prev  = isTV && idx > 0;
  const next  = isTV && idx < eps.length - 1;

  const nav = isTV ? `
    <div class="player-nav">
      <button ${prev ? '' : 'disabled'}
        onclick="playEpisode(${seriesId},${season},${prev ? eps[idx-1].episode_number : 0})">
        ← Previous
      </button>
      <div class="player-ep-label">${title}</div>
      <button ${next ? '' : 'disabled'}
        onclick="playEpisode(${seriesId},${season},${next ? eps[idx+1].episode_number : 0})">
        Next →
      </button>
    </div>` :
    `<div class="player-ep-label" style="margin-top:12px;text-align:center">${title}</div>`;

  document.getElementById('playerView').innerHTML = `
    <div class="player-wrap">
      <div class="player-back" onclick="goBackToDetail()">← Back to Details</div>
      <div class="player-frame-wrap">
        <div class="player-shield" id="playerShield"></div>
        <iframe src="${src}"
          frameborder="0"
          referrerpolicy="origin"
          allowfullscreen
          style="width:100%;height:100%;display:block;border:none;">
        </iframe>
      </div>
      ${nav}
    </div>`;

  // popup blocker — intercept window.open and any new tab attempts from iframe
  installPopupBlocker();
}

// ── POPUP BLOCKER ─────────────────────────────────────────────
function installPopupBlocker() {
  // Override window.open so any popup the iframe triggers via JS gets killed
  window.open = function() { return null; };

  // Catch any beacon/click that tries to navigate top frame
  window.addEventListener('blur', onWindowBlur, { once: false });
}

function onWindowBlur() {
  // When the page loses focus it usually means the iframe fired a popup/redirect.
  // Immediately refocus to cancel it.
  setTimeout(() => window.focus(), 0);
}

// ── NAVIGATION ───────────────────────────────────────────────
function showHome() {
  clearTimeout(S.heroTimer);
  setActiveTab(null);
  setView('home');
  showHero(true);
  if (S.heroItems.length) buildHero(S.heroIdx);
}

function goBack() {
  if (S.tab) {
    loadBrowse();
  } else {
    showHome();
  }
}

function goBackToDetail() {
  if (S.detailItem) {
    setView('detail');
    showHero(false);
  } else {
    goBack();
  }
}

// ── VIEW MANAGER ─────────────────────────────────────────────
function setView(v) {
  S.view = v;
  const map = {
    home:   'homeView',
    browse: 'browseView',
    search: 'searchView',
    detail: 'detailView',
    player: 'playerView',
  };
  Object.entries(map).forEach(([key, id]) => {
    document.getElementById(id).style.display = key === v ? '' : 'none';
  });
}

function showHero(on) {
  document.getElementById('hero').style.display = on ? '' : 'none';
  if (!on) clearTimeout(S.heroTimer);
}

// ── UTILS ────────────────────────────────────────────────────
function loading(on) {
  document.getElementById('loader').style.display = on ? 'flex' : 'none';
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}
