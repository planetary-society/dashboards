
const searchInput = document.getElementById('searchInput');
const cards = Array.from(document.querySelectorAll('.record-card'));
const navItems = Array.from(document.querySelectorAll('.nav-item'));
const navEmpty = document.querySelector('.nav-empty');

// One search box filters both the section list and the cards. The query is whitespace-collapsed and
// lowercased so regulation numbers ("2 CFR 200.1", "200.405") and topic words all match.
function applyFilter() {
  const query = (searchInput.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  let navMatches = 0;
  for (const item of navItems) {
    const match = !query || (item.dataset.search || '').includes(query);
    item.classList.toggle('hidden', !match);
    if (match) navMatches += 1;
  }
  if (navEmpty) navEmpty.classList.toggle('hidden', navMatches !== 0);
  for (const card of cards) {
    const match = !query || (card.dataset.search || '').toLowerCase().includes(query);
    card.classList.toggle('hidden', !match);
  }
}

searchInput.addEventListener('input', applyFilter);

async function loadRecord(card) {
  // `loading` guards against the reveal path firing several loads at once (two <details> toggles
  // plus the direct call) before the first fetch resolves.
  if (card.dataset.loaded === 'true' || card.dataset.loading === 'true') return;
  card.dataset.loading = 'true';
  const file = card.dataset.recordFile;
  const diffSlot = card.querySelector('[data-slot="diff"]');
  const currentSlot = card.querySelector('[data-slot="current"]');
  const proposedSlot = card.querySelector('[data-slot="proposed"]');
  diffSlot.innerHTML = '<p class="empty">Loading comparison text...</p>';
  try {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const record = await response.json();
    diffSlot.innerHTML = record.diff_html || '<p class="empty">No diff text available.</p>';
    currentSlot.innerHTML = record.current_html || '<p class="empty">No current eCFR text available.</p>';
    proposedSlot.innerHTML = record.proposed_html || '<p class="empty">No replacement text follows this amendatory instruction.</p>';
    card.dataset.loaded = 'true';
  } catch (error) {
    diffSlot.innerHTML = `<p class="empty">Could not load comparison text: ${String(error.message || error)}</p>`;
  } finally {
    delete card.dataset.loading;
  }
}

// A section's comparison text loads lazily the first time a reader opens one of its <details>.
for (const card of cards) {
  for (const detail of card.querySelectorAll('details')) {
    detail.addEventListener('toggle', () => {
      if (detail.open) loadRecord(card);
    });
  }
}

// Open both the track-changes and side-by-side views of a card and load its text.
function revealCard(card) {
  card.classList.remove('hidden');
  for (const detail of card.querySelectorAll('details')) detail.open = true;
  loadRecord(card);
}

// The sidebar list mirrors the cards. We track the entry you navigated to: it gets an .is-active
// highlight (which moves as you open another section) and the list auto-scrolls to center it, so
// the current spot stays visible without hunting.
const sidebar = document.querySelector('.sidebar');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const navByHash = new Map();
for (const item of navItems) {
  const link = item.querySelector('a[href^="#"]');
  if (link) navByHash.set(link.getAttribute('href').slice(1), item);
}

// Center the active entry within the sidebar's OWN scroll area (not the page), as far as the
// list's length allows — the browser clamps scrollTop at the two ends.
function centerNavInSidebar(item) {
  if (!sidebar) return;
  const itemRect = item.getBoundingClientRect();
  const sideRect = sidebar.getBoundingClientRect();
  const delta = (itemRect.top - sideRect.top) - (sidebar.clientHeight / 2 - item.offsetHeight / 2);
  sidebar.scrollTo({ top: sidebar.scrollTop + delta, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function setActiveNav(id) {
  const active = navByHash.get(id) || null;
  for (const item of navItems) {
    const on = item === active;
    item.classList.toggle('is-active', on);
    const link = item.querySelector('a');
    if (link) {
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  }
  // offsetParent is null when the entry is filtered out by search; only center a visible one.
  if (active && active.offsetParent !== null) centerNavInSidebar(active);
}

// When the page lands on (or navigates to) a record-card anchor — a summary quicklink, a sidebar
// link, or a shared deep link — expand that card and mark/center its sidebar entry.
function revealFromHash() {
  const id = location.hash.slice(1);
  if (!id) return;
  const card = document.getElementById(id);
  if (!card || !card.classList.contains('record-card')) return;
  revealCard(card);
  card.scrollIntoView({ block: 'start' });
  setActiveNav(id);
}

window.addEventListener('hashchange', revealFromHash);
revealFromHash();

// "Permalink" buttons copy a deep link to that card. The URL is derived from the current location
// (minus any existing #fragment) so it works from a file://, localhost, or deployed https path.
const copyStatus = document.getElementById('copyStatus');

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for non-secure contexts (e.g. a page opened straight from disk).
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy') ? resolve() : reject(new Error('copy rejected')); }
    catch (err) { reject(err); }
    finally { ta.remove(); }
  });
}

for (const button of document.querySelectorAll('.permalink')) {
  const label = button.querySelector('.permalink-label');
  const original = label ? label.textContent : '';
  let resetTimer = null;
  button.addEventListener('click', async () => {
    const url = location.href.split('#')[0] + '#' + button.dataset.anchor;
    let ok = true;
    try { await copyText(url); } catch (err) { ok = false; }
    button.classList.toggle('is-copied', ok);
    if (label) label.textContent = ok ? 'Copied' : 'Copy failed';
    if (copyStatus) copyStatus.textContent = ok ? 'Link copied to clipboard' : 'Could not copy link';
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      button.classList.remove('is-copied');
      if (label) label.textContent = original;
    }, 1600);
  });
}
