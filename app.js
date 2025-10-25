const API_BASE = "https://api.apbugall.org/";
const API_TOKEN = "115f79b05ff195bc531a3878101ee6";

const elements = {
  resultsList: document.getElementById("results-list"),
  resultsEmpty: document.getElementById("results-empty"),
  resultsLoading: document.getElementById("results-loading"),
  resultsError: document.getElementById("results-error"),
  detailsContent: document.getElementById("details-content"),
  refreshButton: document.getElementById("refresh-button"),
  searchForm: document.getElementById("search-form"),
  cardTemplate: document.getElementById("result-card-template"),
};

const state = {
  currentCategory: "movie",
  items: [],
  selectedId: null,
};

function buildUrl(params) {
  const url = new URL(API_BASE);
  url.searchParams.set("token", API_TOKEN);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}`.trim() !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

async function fetchFromApi(params) {
  const endpoint = buildUrl(params);
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`API недоступно (HTTP ${response.status})`);
  }
  const payload = await response.json();
  if (payload.status !== "success") {
    throw new Error(payload.error_info || "Не удалось загрузить данные");
  }
  return payload.data;
}

function normaliseMaterials(data) {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.filter(Boolean);
  }
  if (typeof data === "object") {
    if (Object.prototype.hasOwnProperty.call(data, "name")) {
      return [data];
    }
    return Object.values(data).filter((value) => value && typeof value === "object");
  }
  return [];
}

function renderResults(materials) {
  elements.resultsList.innerHTML = "";
  elements.resultsError.hidden = true;
  elements.resultsError.textContent = "";
  elements.resultsEmpty.hidden = materials.length !== 0;

  if (materials.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();

  materials.forEach((item) => {
    const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
    const button = card.querySelector(".card-button");
    const poster = card.querySelector(".poster");
    const title = card.querySelector(".card-title");
    const meta = card.querySelector(".card-meta");
    const description = card.querySelector(".card-description");

    button.dataset.kp = item.id_kp || "";
    button.dataset.imdb = item.id_imdb || "";
    button.dataset.worldArt = item.id_world_art || "";
    button.dataset.name = item.name || "";

    const posterUrl = safePosterUrl(item.poster);
    poster.src = posterUrl || "https://dummyimage.com/400x600/1c212d/ffffff&text=CinemaFlow";
    poster.alt = item.name ? `Постер: ${item.name}` : "Постер отсутствует";

    title.textContent = item.name || "Без названия";
    meta.textContent = [item.year, buildRatingLabel(item)].filter(Boolean).join(" · ");
    description.textContent = item.description || item.tagline || "Описание появится позже.";

    button.addEventListener("click", () => handleCardClick(item));

    fragment.appendChild(card);
  });

  elements.resultsList.appendChild(fragment);
}

function buildRatingLabel(item) {
  const ratings = [];
  if (item.rating_kp) ratings.push(`KP ${item.rating_kp}`);
  if (item.rating_imdb) ratings.push(`IMDb ${item.rating_imdb}`);
  return ratings.join(" / ");
}

function safePosterUrl(url) {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function setResultsLoading(isLoading) {
  elements.resultsLoading.hidden = !isLoading;
  elements.resultsList.ariaBusy = String(isLoading);
}

function setDetailsLoading() {
  elements.detailsContent.innerHTML = `
    <div class="detail-block">
      <p>Загружаем карточку…</p>
    </div>
  `;
}

async function handleCardClick(item) {
  setDetailsLoading();
  try {
    const details = await fetchDetails(item);
    state.selectedId = buildMaterialKey(details);
    renderDetails(details);
  } catch (error) {
    elements.detailsContent.innerHTML = `
      <div class="detail-block">
        <h4>Не удалось загрузить информацию</h4>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function buildMaterialKey(item) {
  return item.id_kp || item.id_imdb || item.id_world_art || item.name || "unknown";
}

async function fetchDetails(item) {
  const params = {};
  if (item.id_kp) params.kp = item.id_kp;
  else if (item.id_imdb) params.imdb = item.id_imdb;
  else if (item.id_world_art) params.world_art = item.id_world_art;
  else if (item.name) params.name = item.name;

  if (Object.keys(params).length === 0) {
    return item;
  }

  try {
    const fullData = await fetchFromApi(params);
    return fullData || item;
  } catch (error) {
    console.warn("Не удалось получить подробности, используем базовые данные", error);
    return item;
  }
}

function renderDetails(item) {
  const {
    name,
    original_name,
    year,
    genre,
    country,
    actors,
    directors,
    producers,
    time,
    age_restrictions,
    rating_mpaa,
    translation,
    quality,
    description,
  } = item;

  const fragment = document.createDocumentFragment();

  const header = document.createElement("div");
  header.className = "details-header";

  const title = document.createElement("h3");
  title.textContent = name || "Без названия";

  const subtitle = document.createElement("p");
  subtitle.className = "card-meta";
  const subtitleParts = [];
  if (original_name && original_name !== name) subtitleParts.push(original_name);
  if (year) subtitleParts.push(year);
  subtitle.textContent = subtitleParts.join(" · ");

  const metaRow = document.createElement("div");
  metaRow.className = "details-meta";
  const metaChips = [
    buildMetaChip("Длительность", time),
    buildMetaChip("Возраст", age_restrictions),
    buildMetaChip("MPAA", rating_mpaa),
    buildMetaChip("Озвучки", translation),
    buildMetaChip("Качества", quality),
  ].filter(Boolean);
  metaChips.forEach((chip) => metaRow.appendChild(chip));

  header.append(title);
  if (subtitle.textContent) header.append(subtitle);
  if (metaRow.childElementCount) header.append(metaRow);

  const descriptionBlock = document.createElement("div");
  descriptionBlock.className = "detail-block";
  const descriptionTitle = document.createElement("h4");
  descriptionTitle.textContent = "Описание";
  const descriptionText = document.createElement("p");
  descriptionText.textContent = description || "Описание пока не доступно.";
  descriptionBlock.append(descriptionTitle, descriptionText);

  const listsBlock = document.createElement("div");
  listsBlock.className = "detail-block";
  const listsFragment = document.createDocumentFragment();
  listsFragment.append(
    buildListSection("Жанры", genre),
    buildListSection("Страны", country),
    buildListSection("Актеры", actors),
    buildListSection("Режиссеры", directors),
    buildListSection("Продюсеры", producers),
  );
  listsBlock.append(listsFragment);

  const iframeBlock = document.createElement("div");
  iframeBlock.className = "detail-block iframe-wrapper";
  const iframeTitle = document.createElement("h4");
  iframeTitle.textContent = "Плеер (тестовый режим)";
  const iframeContainer = document.createElement("div");
  iframeContainer.className = "translation-select";

  const translations = getTranslationOptions(item);
  let selectedTranslation = Object.keys(translations)[0] || null;

  if (selectedTranslation) {
    const selectLabel = document.createElement("label");
    selectLabel.textContent = "Озвучка:";
    const select = document.createElement("select");

    Object.entries(translations).forEach(([id, option]) => {
      const optionElement = document.createElement("option");
      optionElement.value = id;
      optionElement.textContent = buildTranslationLabel(option);
      if (id === selectedTranslation) {
        optionElement.selected = true;
      }
      select.append(optionElement);
    });

    select.addEventListener("change", (event) => {
      selectedTranslation = event.target.value;
      const newSrc = resolveIframeSrc(item, translations, selectedTranslation);
      iframeElement.src = newSrc;
    });

    iframeContainer.append(selectLabel, select);
  }

  const iframeElement = document.createElement("iframe");
  iframeElement.title = name ? `Плеер: ${name}` : "Плеер";
  iframeElement.allowFullscreen = true;
  iframeElement.referrerPolicy = "no-referrer";
  iframeElement.src = resolveIframeSrc(item, translations, selectedTranslation);

  const iframeHint = document.createElement("p");
  iframeHint.className = "card-meta";
  iframeHint.textContent = "Если плеер не загружается, проверьте доступность iframe у поставщика.";

  iframeBlock.append(iframeTitle, iframeContainer, iframeElement, iframeHint);

  fragment.append(header, descriptionBlock, listsBlock, iframeBlock);
  elements.detailsContent.innerHTML = "";
  elements.detailsContent.append(fragment);
}

function buildTranslationLabel(option) {
  const parts = [option.name, option.quality && `(${option.quality})`].filter(Boolean);
  return parts.join(" ");
}

function resolveIframeSrc(item, translations, translationId) {
  const preferred = translationId && translations[translationId] && safeIframeUrl(translations[translationId].iframe);
  if (preferred) return preferred;
  const fallback = safeIframeUrl(item.iframe);
  return fallback || "https://www.youtube.com/embed/dQw4w9WgXcQ";
}

function safeIframeUrl(url) {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.toString();
  } catch (error) {
    return null;
  }
}

function buildMetaChip(label, value) {
  if (!value) return null;
  const chip = document.createElement("span");
  chip.className = "meta-chip";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = `${label}:`;
  const valueSpan = document.createElement("strong");
  valueSpan.textContent = value;
  chip.append(labelSpan, valueSpan);
  return chip;
}

function buildListSection(title, data) {
  const values = parseList(data);
  if (values.length === 0) return document.createDocumentFragment();
  const wrapper = document.createElement("div");
  const heading = document.createElement("h4");
  heading.textContent = title;
  const list = document.createElement("ul");
  values.forEach((value) => {
    const item = document.createElement("li");
    item.textContent = value;
    list.append(item);
  });
  wrapper.append(heading, list);
  return wrapper;
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/,|\//)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function getTranslationOptions(item) {
  if (!item || typeof item !== "object" || !item.translation_iframe) {
    return {};
  }
  return Object.entries(item.translation_iframe).reduce((acc, [id, data]) => {
    if (data && data.iframe && /^https?:\/\//i.test(data.iframe)) {
      acc[id] = data;
    }
    return acc;
  }, {});
}

async function loadShowcase(category = "movie") {
  state.currentCategory = category;
  setResultsLoading(true);
  try {
    const data = await fetchFromApi({ list: category });
    const materials = normaliseMaterials(data);
    state.items = materials;
    renderResults(materials);
  } catch (error) {
    console.error(error);
    elements.resultsError.hidden = false;
    elements.resultsError.textContent = error.message;
    elements.resultsList.innerHTML = "";
    elements.resultsEmpty.hidden = false;
  } finally {
    setResultsLoading(false);
  }
}

async function handleSearch(event) {
  event.preventDefault();
  const formData = new FormData(elements.searchForm);
  const query = formData.get("query");
  const year = formData.get("year");
  const category = formData.get("list") || "";

  const params = { name: query };
  if (year) params.year = year;
  if (category) params.list = category;

  setResultsLoading(true);
  try {
    const data = await fetchFromApi(params);
    const materials = normaliseMaterials(data);
    state.items = materials;
    renderResults(materials);
  } catch (error) {
    console.error(error);
    elements.resultsError.hidden = false;
    elements.resultsError.textContent = error.message;
    elements.resultsList.innerHTML = "";
    elements.resultsEmpty.hidden = false;
  } finally {
    setResultsLoading(false);
  }
}

function handleRefresh() {
  loadShowcase(state.currentCategory || "movie");
}

document.addEventListener("DOMContentLoaded", () => {
  loadShowcase(state.currentCategory);
});

elements.searchForm.addEventListener("submit", handleSearch);
elements.refreshButton.addEventListener("click", handleRefresh);
