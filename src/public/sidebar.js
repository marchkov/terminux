const SEARCH_MINIMUM = 1;

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function initSidebarSearch() {
  const input = document.querySelector("[data-sidebar-search]");
  if (!input) return;

  const ownedCards = Array.from(document.querySelectorAll("[data-group-card]"));
  const sharedCards = Array.from(document.querySelectorAll("[data-shared-card]"));
  const favoriteCards = Array.from(document.querySelectorAll("[data-favorite-card]"));
  const ownedFilterEmpty = document.querySelector("[data-owned-filter-empty]");
  const sharedFilterEmpty = document.querySelector("[data-shared-filter-empty]");
  const favoritesFilterEmpty = document.querySelector("[data-favorites-filter-empty]");
  const sharedStaticEmpty = document.querySelector("[data-shared-empty]");
  const favoritesStaticEmpty = document.querySelector("[data-favorites-empty]");
  const searchMeta = document.querySelector("[data-sidebar-search-meta]");

  function setMeta(textValue) {
    if (searchMeta) searchMeta.textContent = textValue;
  }

  function filterOwned(term) {
    let visibleCards = 0;

    for (const card of ownedCards) {
      const groupName = normalize(card.dataset.groupName);
      const links = Array.from(card.querySelectorAll(".session-link"));
      let visibleLinks = 0;

      for (const link of links) {
        const sessionName = normalize(link.dataset.sessionName || link.textContent);
        const matches = !term || groupName.includes(term) || sessionName.includes(term);
        link.classList.toggle("is-hidden", !matches);
        if (matches) visibleLinks += 1;
      }

      const note = card.querySelector("[data-empty-note]");
      if (note) {
        note.classList.toggle("is-hidden", !!term);
      }

      const hasVisibleContent = !term || groupName.includes(term) || visibleLinks > 0;
      card.classList.toggle("is-hidden", !hasVisibleContent);
      if (hasVisibleContent) visibleCards += 1;
    }

    if (ownedFilterEmpty) {
      ownedFilterEmpty.classList.toggle("is-hidden", !term || visibleCards > 0);
    }
  }

  function filterFlatCards(cards, staticEmpty, filterEmpty, term) {
    let visibleCards = 0;

    for (const card of cards) {
      const sessionName = normalize(card.dataset.sessionName);
      const ownerName = normalize(card.dataset.ownerName);
      const matches = !term || sessionName.includes(term) || ownerName.includes(term);
      card.classList.toggle("is-hidden", !matches);
      if (matches) visibleCards += 1;
    }

    if (staticEmpty) {
      staticEmpty.classList.toggle("is-hidden", !!term);
    }
    if (filterEmpty) {
      filterEmpty.classList.toggle("is-hidden", !term || visibleCards > 0 || cards.length === 0);
    }
  }

  function applySearch() {
    const rawTerm = normalize(input.value);
    const term = rawTerm.length >= SEARCH_MINIMUM ? rawTerm : "";

    filterOwned(term);
    filterFlatCards(sharedCards, sharedStaticEmpty, sharedFilterEmpty, term);
    filterFlatCards(favoriteCards, favoritesStaticEmpty, favoritesFilterEmpty, term);

    if (!term) {
      setMeta("Type to filter your workspace.");
      return;
    }

    setMeta(`Filtering sidebar for: ${input.value.trim()}`);
  }

  input.addEventListener("input", applySearch);
  input.addEventListener("search", applySearch);
  applySearch();
}

initSidebarSearch();
