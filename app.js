const API_BASE = "https://api.apbugall.org/";
const STORAGE_KEY = "cinemaFlowSettings";
const DEFAULT_SETTINGS = {
  apiToken: "115f79b05ff195bc531a3878101ee6",
  playerDomain: "https://video.apbugall.org/",
};

const settings = loadSettings();

const elements = {
  resultsList: document.getElementById("results-list"),
  resultsEmpty: document.getElementById("results-empty"),
  resultsLoading: document.getElementById("results-loading"),
  resultsError: document.getElementById("results-error"),
  detailsContent: document.getElementById("details-content"),
  refreshButton: document.getElementById("refresh-button"),
  searchForm: document.getElementById("search-form"),
  cardTemplate: document.getElementById("result-card-template"),
  settingsButton: document.getElementById("settings-button"),
  settingsDialog: document.getElementById("settings-dialog"),
  settingsForm: document.getElementById("settings-form"),
  settingsClose: document.getElementById("settings-close"),
  settingsReset: document.getElementById("settings-reset"),
  settingsToken: document.getElementById("settings-token"),
  settingsPlayer: document.getElementById("settings-player"),
  liveRegion: document.getElementById("live-region"),
};

const state = {
  currentCategory: "movie",
  items: [],
  selectedId: null,
  selectedDetails: null,
};

function buildUrl(params) {
  const url = new URL(API_BASE);
  url.searchParams.set("token", getApiToken());
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
    state.selectedDetails = details;
    renderDetails(details);
  } catch (error) {
    state.selectedDetails = null;
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
  let iframeElement = null;

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
      selectedTranslation = event.target.value || null;
      updatePlayerSource();
    });

    iframeContainer.append(selectLabel, select);
  }

  const overlayButton = document.createElement("button");
  overlayButton.type = "button";
  overlayButton.className = "player-overlay";
  overlayButton.innerHTML = "<span>Нажмите, чтобы загрузить плеер</span>";

  const iframeHint = document.createElement("p");
  iframeHint.className = "card-meta";
  const playerHost = safePlayerHost();
  iframeHint.textContent = `Плеер подключается к ${playerHost}. Убедитесь, что домен добавлен в настройки видеобалансера.`;

  const mountIframe = (autoplay = false) => {
    const playerBaseConfigured = Boolean(getPlayerBase());
    const src = buildPlayerSrc(item, { translationId: selectedTranslation, autoplay });
    if (!src) {
      overlayButton.disabled = true;
      overlayButton.textContent = playerBaseConfigured
        ? "Недостаточно данных для подключения плеера"
        : "Укажите домен плеера в настройках";
      return;
    }

    iframeElement = createPlayerIframe(src, name);
    overlayButton.replaceWith(iframeElement);
  };

  const updatePlayerSource = () => {
    const playerBaseConfigured = Boolean(getPlayerBase());
    const src = buildPlayerSrc(item, { translationId: selectedTranslation, autoplay: Boolean(iframeElement) });
    if (!src) {
      if (!iframeElement) {
        overlayButton.disabled = true;
        overlayButton.textContent = playerBaseConfigured
          ? "Недостаточно данных для подключения плеера"
          : "Укажите домен плеера в настройках";
      }
      return;
    }

    overlayButton.disabled = false;
    overlayButton.innerHTML = "<span>Нажмите, чтобы загрузить плеер</span>";

    if (iframeElement) {
      iframeElement.src = src;
    }
  };

  overlayButton.addEventListener("click", () => {
    mountIframe(true);
  });

  iframeBlock.append(iframeTitle, iframeContainer, overlayButton, iframeHint);

  updatePlayerSource();

  fragment.append(header, descriptionBlock, listsBlock, iframeBlock);
  elements.detailsContent.innerHTML = "";
  elements.detailsContent.append(fragment);
}

function buildTranslationLabel(option) {
  const parts = [option.name, option.quality && `(${option.quality})`].filter(Boolean);
  return parts.join(" ");
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

function buildPlayerSrc(item, { translationId, autoplay } = {}) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const playerBase = getPlayerBase();
  if (!playerBase) {
    return null;
  }

  const url = new URL(playerBase);
  url.searchParams.set("token", getApiToken());

  let hasIdentifier = false;

  if (item.id_kp) {
    url.searchParams.set("kp", item.id_kp);
    hasIdentifier = true;
  } else if (item.id_imdb) {
    url.searchParams.set("imdb", item.id_imdb);
    hasIdentifier = true;
  } else if (item.id_world_art) {
    url.searchParams.set("world_art", item.id_world_art);
    hasIdentifier = true;
  } else if (item.name) {
    url.searchParams.set("name", item.name);
    if (item.year) {
      url.searchParams.set("year", item.year);
    }
    hasIdentifier = true;
  }

  if (translationId) {
    url.searchParams.set("translation", translationId);
  }

  if (autoplay) {
    url.searchParams.set("autoplay", "1");
  }

  if (hasIdentifier) {
    return url.toString();
  }

  const fallback = safeIframeUrl(item.iframe);
  if (!fallback) {
    return null;
  }

  try {
    const fallbackUrl = new URL(fallback);
    if (translationId) {
      fallbackUrl.searchParams.set("translation", translationId);
    }
    if (autoplay) {
      fallbackUrl.searchParams.set("autoplay", "1");
    }
    return fallbackUrl.toString();
  } catch (error) {
    return fallback;
  }
}

function createPlayerIframe(src, name) {
  const iframe = document.createElement("iframe");
  iframe.title = name ? `Плеер: ${name}` : "Плеер";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "no-referrer-when-downgrade";
  iframe.scrolling = "no";
  iframe.loading = "lazy";
  iframe.src = src;
  return iframe;
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

function handleSettingsOpen() {
  if (!elements.settingsDialog || !elements.settingsToken) return;
  populateSettingsForm();
  elements.settingsDialog.hidden = false;
  elements.settingsDialog.classList.add("is-open");
  if (elements.settingsButton) {
    elements.settingsButton.setAttribute("aria-expanded", "true");
  }
  elements.settingsToken.focus();
}

function handleSettingsClose() {
  if (!elements.settingsDialog) return;
  elements.settingsDialog.classList.remove("is-open");
  elements.settingsDialog.hidden = true;
  if (elements.settingsButton) {
    elements.settingsButton.setAttribute("aria-expanded", "false");
    elements.settingsButton.focus();
  }
}

function populateSettingsForm() {
  if (!elements.settingsToken || !elements.settingsPlayer) return;
  elements.settingsToken.value = settings.apiToken || "";
  elements.settingsPlayer.value = settings.playerDomain || "";
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  if (elements.settingsForm && !elements.settingsForm.checkValidity()) {
    elements.settingsForm.reportValidity();
    return;
  }
  const formData = new FormData(elements.settingsForm);
  const rawToken = formData.get("token");
  const apiToken = typeof rawToken === "string" ? rawToken.trim() : "";
  const rawPlayer = formData.get("player");
  const playerDomain = normalisePlayerDomain(rawPlayer);

  if (!apiToken || !playerDomain) {
    announce("Укажите токен и корректный домен плеера.");
    return;
  }

  settings.apiToken = apiToken;
  settings.playerDomain = playerDomain;
  persistSettings(settings);
  handleSettingsClose();
  announce("Настройки сохранены.");
  handleRefresh();
  if (state.selectedDetails) {
    renderDetails(state.selectedDetails);
  }
}

function handleSettingsReset() {
  if (!elements.settingsForm) return;
  settings.apiToken = DEFAULT_SETTINGS.apiToken;
  settings.playerDomain = DEFAULT_SETTINGS.playerDomain;
  persistSettings(settings);
  populateSettingsForm();
  announce("Настройки сброшены к значениям по умолчанию.");
  handleRefresh();
  if (state.selectedDetails) {
    renderDetails(state.selectedDetails);
  }
}

function loadSettings() {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      apiToken:
        typeof parsed.apiToken === "string" && parsed.apiToken.trim()
          ? parsed.apiToken.trim()
          : DEFAULT_SETTINGS.apiToken,
      playerDomain: normalisePlayerDomain(parsed.playerDomain) || DEFAULT_SETTINGS.playerDomain,
    };
  } catch (error) {
    console.warn("Не удалось загрузить настройки, используются значения по умолчанию", error);
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(value) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function getApiToken() {
  return settings.apiToken || DEFAULT_SETTINGS.apiToken;
}

function getPlayerBase() {
  return normalisePlayerDomain(settings.playerDomain);
}

function normalisePlayerDomain(value) {
  if (!value) return null;
  const trimmed = value.toString().trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (!url.protocol.startsWith("http")) {
      return null;
    }
    if (!url.pathname.endsWith("/")) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/`;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch (error) {
    return null;
  }
}

function safePlayerHost() {
  const base = getPlayerBase();
  if (!base) return "вашему домену";
  try {
    return new URL(base).host;
  } catch (error) {
    return base;
  }
}

function announce(message) {
  if (!elements.liveRegion) return;
  elements.liveRegion.textContent = "";
  elements.liveRegion.textContent = message;
}

document.addEventListener("DOMContentLoaded", () => {
  loadShowcase(state.currentCategory);
  populateSettingsForm();
});

if (elements.searchForm) {
  elements.searchForm.addEventListener("submit", handleSearch);
}

if (elements.refreshButton) {
  elements.refreshButton.addEventListener("click", handleRefresh);
}

if (elements.settingsButton) {
  elements.settingsButton.addEventListener("click", handleSettingsOpen);
}

if (elements.settingsClose) {
  elements.settingsClose.addEventListener("click", handleSettingsClose);
}

if (elements.settingsForm) {
  elements.settingsForm.addEventListener("submit", handleSettingsSubmit);
}

if (elements.settingsReset) {
  elements.settingsReset.addEventListener("click", handleSettingsReset);
}

if (elements.settingsDialog) {
  elements.settingsDialog.addEventListener("click", (event) => {
    if (event.target === elements.settingsDialog) {
      handleSettingsClose();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    elements.settingsDialog &&
    elements.settingsDialog.classList.contains("is-open")
  ) {
    handleSettingsClose();
  }
});
