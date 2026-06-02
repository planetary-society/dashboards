
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

// When the page lands on (or navigates to) a #record-N anchor — a summary quicklink, a sidebar
// link, or a shared deep link — expand that card so the comparison is visible immediately.
function revealFromHash() {
  const id = location.hash.slice(1);
  if (!id) return;
  const card = document.getElementById(id);
  if (!card || !card.classList.contains('record-card')) return;
  revealCard(card);
  card.scrollIntoView({ block: 'start' });
}

window.addEventListener('hashchange', revealFromHash);
revealFromHash();
