const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : {
  ready() {}, expand() {}, MainButton: { hide() {} }, BackButton: { onClick() {}, show() {}, hide() {} },
  HapticFeedback: null, openTelegramLink(url) { window.open(url, "_blank"); }, showAlert(message) { alert(message); }
};

tg.ready();
tg.expand();
try {
  tg.setHeaderColor && tg.setHeaderColor("#ffffff");
  tg.setBackgroundColor && tg.setBackgroundColor("#ffffff");
  tg.MainButton.hide();
} catch (error) {}

const MANAGER_USERNAME = "tonnnya_t";
const FAVORITES_STORAGE_KEY = "freshdecor_favorites_v1";

const CATEGORY_GROUPS = [
  { id: "decor", name: "Декор", cover: "assets/category-decor.jpg" },
  { id: "decorations", name: "Декорации", cover: "assets/category-decorations.jpg" },
  { id: "lighting", name: "Освещение", cover: "assets/category-lighting.jpg" },
  { id: "tableware", name: "Посуда", cover: "assets/category-tableware.jpg" },
  { id: "textile", name: "Текстиль", cover: "assets/category-textile.jpg" },
  { id: "furniture", name: "Мебель", cover: "assets/category-furniture.jpg" },
  { id: "structures", name: "Конструкции", cover: "assets/category-structures.jpg" }
];

let catalog = { products: [], categories: [] };
let currentSearch = "";
let currentGroup = null;
let currentSubcategory = null;
let currentProduct = null;
let favoriteSkus = loadFavorites();
const navStack = [{ name: "home", scrollY: 0 }];

async function loadCatalog() {
  try {
    const response = await fetch("data.json?v=" + Date.now());
    if (!response.ok) throw new Error("HTTP " + response.status);
    catalog = await response.json();
    document.getElementById("catalog-loader").classList.add("hidden");
    renderHomeCategories();
    renderDirectory();
    renderFavorites();
    renderBottomNav();
  } catch (error) {
    console.error(error);
    document.getElementById("catalog-loader").textContent = "Не удалось загрузить каталог. Попробуйте позже.";
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatPrice(value) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function loadFavorites() {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch (error) {
    return new Set();
  }
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favoriteSkus]));
}

function isFavorite(sku) {
  return favoriteSkus.has(String(sku));
}

function toggleFavorite(sku) {
  const key = String(sku);
  favoriteSkus.has(key) ? favoriteSkus.delete(key) : favoriteSkus.add(key);
  saveFavorites();
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  renderFavorites();
  renderVisibleProductLists();
  updateDetailFavoriteButton();
  renderBottomNav();
}

function getFavoriteProducts() {
  return catalog.products.filter(product => isFavorite(product.sku));
}

function getGeneralCategory(product) {
  const category = (product.category || "").trim();
  const subcategory = (product.subcategory || "").trim();

  if (!subcategory || ["Ретро", "Цветы / Лепестки", "Другое", "Зеркала", "Батут"].includes(subcategory)) return "decorations";
  if (subcategory === "Зонты") return "furniture";
  if (["Пледы", "Подушки", "Ковры", "Ткань"].includes(subcategory)) return "textile";
  if (subcategory === "Матрасы") return "furniture";
  if (["Арки", "Стойки", "Вентиляторы"].includes(subcategory)) return "structures";
  if (/^Рамки\s*\/\s*[Мм]ольберты$/.test(subcategory) || ["Номерки на столы", "Мольберты", "Цветочницы", "Спортивный инвентарь"].includes(subcategory)) return "decor";
  if (category === "Освещение") return "lighting";
  if (category === "Посуда") return "tableware";
  if (category === "Текстиль" || category === "Ткань") return "textile";
  if (category === "Мебель") return "furniture";
  return "decor";
}

function getGroup(groupId) {
  return CATEGORY_GROUPS.find(group => group.id === groupId);
}

function productsForGroup(groupId) {
  return catalog.products.filter(product => getGeneralCategory(product) === groupId);
}

function subcategoriesForGroup(groupId) {
  const counts = new Map();
  productsForGroup(groupId).forEach(product => {
    const label = (product.subcategory || "Другое").trim();
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
}

function saveCurrentScroll() {
  const current = navStack[navStack.length - 1];
  if (current) current.scrollY = window.scrollY;
}

function showScreen(name, scrollY = 0) {
  document.querySelectorAll(".screen").forEach(screen => screen.classList.add("hidden"));
  document.getElementById("screen-" + name).classList.remove("hidden");

  const hasBack = name === "product" || name === "products";
  document.getElementById("back-btn").classList.toggle("hidden", !hasBack);
  try { hasBack ? tg.BackButton.show() : tg.BackButton.hide(); } catch (error) {}

  renderBottomNav(name);
  requestAnimationFrame(() => window.scrollTo({ top: scrollY, left: 0, behavior: "instant" }));
}

function pushScreen(name) {
  saveCurrentScroll();
  navStack.push({ name, scrollY: 0 });
  showScreen(name, 0);
}

function goBack() {
  if (navStack.length <= 1) {
    openHome();
    return;
  }
  navStack.pop();
  const previous = navStack[navStack.length - 1];
  showScreen(previous.name, previous.scrollY || 0);
}

function switchRoot(name) {
  navStack.length = 0;
  navStack.push({ name, scrollY: 0 });
  showScreen(name, 0);
}

function openHome() {
  switchRoot("home");
}

function openFavorites() {
  renderFavorites();
  switchRoot("favorites");
}

function openDirectory() {
  renderDirectory();
  switchRoot("directory");
}

function renderBottomNav(activeScreen) {
  const current = activeScreen || navStack[navStack.length - 1]?.name || "home";
  const activeRoot = current === "products" || current === "product"
    ? (navStack[0]?.name || "home")
    : current;

  document.getElementById("nav-home").classList.toggle("active", activeRoot === "home");
  document.getElementById("nav-favorites").classList.toggle("active", activeRoot === "favorites");
  document.getElementById("nav-directory").classList.toggle("active", activeRoot === "directory");

  const badge = document.getElementById("favorites-count");
  badge.textContent = String(favoriteSkus.size);
  badge.classList.toggle("hidden", favoriteSkus.size === 0);
}

function imagePlaceholder(className) {
  return `<div class="${className} image-placeholder-fallback" aria-hidden="true">
    <img src="logo.png" alt="" class="placeholder-logo">
  </div>`;
}

function imageHtml(product, context) {
  const placeholderClass = context === "detail" ? "detail-image-placeholder" : "product-image-placeholder";
  const placeholder = imagePlaceholder(placeholderClass);
  if (!product.photo) return placeholder;
  return `<img src="${escapeHtml(product.photo)}" alt="${escapeHtml(product.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('is-missing'); this.remove()">${placeholder}`;
}

function heartIcon(filled) {
  return `<svg width="21" height="21" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.8a5.3 5.3 0 0 0-7.5 0L12 6.1l-1.3-1.3a5.3 5.3 0 0 0-7.5 7.5L12 21l8.8-8.7a5.3 5.3 0 0 0 0-7.5Z"/></svg>`;
}

function renderHomeCategories() {
  document.getElementById("home-total").textContent = `${catalog.products.length} позиций`;
  document.getElementById("category-grid").innerHTML = CATEGORY_GROUPS.map(group => {
    const products = productsForGroup(group.id);
    const media = `<img src="${escapeHtml(group.cover)}" alt="${escapeHtml(group.name)}" loading="lazy">`;
    return `<button class="category-card" type="button" data-group="${group.id}">
      <span class="category-media">${media}</span>
      <span class="category-overlay"></span>
      <span class="category-copy">
        <strong>${escapeHtml(group.name)}</strong>
        <small>${products.length} позиций</small>
      </span>
      <span class="category-arrow" aria-hidden="true">↗</span>
    </button>`;
  }).join("");

  document.querySelectorAll(".category-card").forEach(button => {
    button.addEventListener("click", () => openProductList(button.dataset.group));
  });
}

function renderSearchResults() {
  const resultsSection = document.getElementById("search-results-section");
  const categoriesSection = document.getElementById("home-categories-section");
  const query = currentSearch.trim().toLowerCase();

  if (!query) {
    resultsSection.classList.add("hidden");
    categoriesSection.classList.remove("hidden");
    return;
  }

  const results = catalog.products.filter(product =>
    String(product.name || "").toLowerCase().includes(query) ||
    String(product.sku || "").toLowerCase().includes(query) ||
    String(product.subcategory || "").toLowerCase().includes(query) ||
    String(product.category || "").toLowerCase().includes(query)
  );

  categoriesSection.classList.add("hidden");
  resultsSection.classList.remove("hidden");
  document.getElementById("search-count").textContent = `${results.length} найдено`;
  renderProductGrid("search-results-grid", "search-empty", results);
}

function openProductList(groupId, subcategory = null) {
  currentGroup = groupId;
  currentSubcategory = subcategory;
  renderProductList();
  pushScreen("products");
}

function renderProductList() {
  const group = getGroup(currentGroup);
  if (!group) return;

  let products = productsForGroup(group.id);
  if (currentSubcategory) products = products.filter(product => (product.subcategory || "Другое") === currentSubcategory);

  document.getElementById("products-kicker").textContent = currentSubcategory ? group.name : "Категория";
  document.getElementById("products-title").textContent = currentSubcategory || group.name;
  document.getElementById("products-count").textContent = `${products.length} позиций`;
  renderSubcategoryChips(group.id);
  renderProductGrid("products-grid", "products-empty", products);
}

function renderSubcategoryChips(groupId) {
  const subcategories = subcategoriesForGroup(groupId);
  const items = [{ name: "Все", value: null }, ...subcategories.map(item => ({ name: item.name, value: item.name }))];
  const container = document.getElementById("chips-row");
  container.innerHTML = items.map(item => `<button class="chip ${item.value === currentSubcategory ? "active" : ""}" type="button" data-subcategory="${escapeHtml(item.value || "")}">${escapeHtml(item.name)}</button>`).join("");
  container.querySelectorAll(".chip").forEach(button => {
    button.addEventListener("click", () => {
      currentSubcategory = button.dataset.subcategory || null;
      renderProductList();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function productCardHtml(product) {
  const favorite = isFavorite(product.sku);
  return `<article class="product-card" data-sku="${escapeHtml(product.sku)}" role="button" tabindex="0">
    <div class="product-card-image ${product.photo ? "" : "is-missing"}">
      ${imageHtml(product, "card")}
      <button class="favorite-btn ${favorite ? "active" : ""}" type="button" data-favorite-sku="${escapeHtml(product.sku)}" aria-label="${favorite ? "Убрать из избранного" : "Добавить в избранное"}">${heartIcon(favorite)}</button>
    </div>
    <div class="product-card-body">
      <span class="product-card-sku">${escapeHtml(product.sku)}</span>
      <h3>${escapeHtml(product.name)}</h3>
      <p>${formatPrice(product.price)} BYN <small>/ сутки</small></p>
    </div>
  </article>`;
}

function renderProductGrid(gridId, emptyId, products) {
  const grid = document.getElementById(gridId);
  const empty = document.getElementById(emptyId);
  grid.innerHTML = products.map(productCardHtml).join("");
  empty.classList.toggle("hidden", products.length > 0);
  bindProductGrid(grid);
}

function bindProductGrid(container) {
  container.querySelectorAll(".product-card").forEach(card => {
    card.addEventListener("click", event => {
      if (!event.target.closest(".favorite-btn")) openProduct(card.dataset.sku);
    });
    card.addEventListener("keydown", event => {
      if ((event.key === "Enter" || event.key === " ") && !event.target.closest(".favorite-btn")) {
        event.preventDefault();
        openProduct(card.dataset.sku);
      }
    });
  });

  container.querySelectorAll(".favorite-btn").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      toggleFavorite(button.dataset.favoriteSku);
    });
  });
}

function renderVisibleProductLists() {
  const current = navStack[navStack.length - 1]?.name;
  if (current === "products") renderProductList();
  if (current === "home" && currentSearch) renderSearchResults();
}

function openProduct(sku) {
  const product = catalog.products.find(item => String(item.sku) === String(sku));
  if (!product) return;
  currentProduct = product;
  const favorite = isFavorite(product.sku);
  const group = getGroup(getGeneralCategory(product));

  document.getElementById("product-detail").innerHTML = `<article class="product-detail">
    <div class="detail-image ${product.photo ? "" : "is-missing"}">
      ${imageHtml(product, "detail")}
      <button id="detail-favorite" class="detail-favorite ${favorite ? "active" : ""}" type="button" aria-label="${favorite ? "Убрать из избранного" : "Добавить в избранное"}">${heartIcon(favorite)}</button>
    </div>
    <div class="detail-copy">
      <p class="detail-path">${escapeHtml(group?.name || "Каталог")} · ${escapeHtml(product.subcategory || "Другое")}</p>
      <p class="detail-sku">Артикул ${escapeHtml(product.sku)}</p>
      <h1>${escapeHtml(product.name)}</h1>
      <div class="detail-facts">
        <div><span>Аренда</span><strong>${formatPrice(product.price)} BYN</strong><small>за сутки</small></div>
        <div><span>Количество</span><strong>${escapeHtml(product.qty)} шт.</strong><small>в каталоге</small></div>
      </div>
      ${product.notes ? `<div class="detail-notes"><span>Примечание</span><p>${escapeHtml(product.notes)}</p></div>` : ""}
      <button class="btn-primary" id="ask-btn" type="button">Уточнить у менеджера <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
    </div>
  </article>`;

  document.getElementById("detail-favorite").addEventListener("click", () => toggleFavorite(product.sku));
  document.getElementById("ask-btn").addEventListener("click", () => askManager(product));
  pushScreen("product");
}

function updateDetailFavoriteButton() {
  const button = document.getElementById("detail-favorite");
  if (!button || !currentProduct) return;
  const favorite = isFavorite(currentProduct.sku);
  button.classList.toggle("active", favorite);
  button.setAttribute("aria-label", favorite ? "Убрать из избранного" : "Добавить в избранное");
  button.innerHTML = heartIcon(favorite);
}

function renderFavorites() {
  const products = getFavoriteProducts();
  renderProductGrid("favorites-grid", "favorites-empty", products);
  document.getElementById("ask-favorites-btn").disabled = products.length === 0;
}

function renderDirectory() {
  document.getElementById("directory-groups").innerHTML = CATEGORY_GROUPS.map(group => {
    const subcategories = subcategoriesForGroup(group.id);
    const total = productsForGroup(group.id).length;
    return `<section class="directory-group">
      <button class="directory-group-head" type="button" data-directory-group="${group.id}">
        <span><small>${total} позиций</small><strong>${escapeHtml(group.name)}</strong></span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
      <div class="directory-list">
        ${subcategories.map(item => `<button type="button" data-directory-group="${group.id}" data-directory-sub="${escapeHtml(item.name)}"><span>${escapeHtml(item.name)}</span><small>${item.count}</small></button>`).join("")}
      </div>
    </section>`;
  }).join("");

  document.querySelectorAll("[data-directory-group]").forEach(button => {
    button.addEventListener("click", () => openProductList(button.dataset.directoryGroup, button.dataset.directorySub || null));
  });
}

function openManagerWithText(text) {
  const url = `https://t.me/${MANAGER_USERNAME}?text=${encodeURIComponent(text)}`;
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (error) {}
  try { tg.openTelegramLink(url); } catch (error) { window.open(url, "_blank"); }
}

function askManager(product) {
  openManagerWithText(`Здравствуйте! Интересует позиция:\n${product.sku} — «${product.name}» — ${formatPrice(product.price)} BYN/сутки.\n\nПодскажите, пожалуйста, детали аренды.`);
}

function askFavoritesManager() {
  const products = getFavoriteProducts();
  if (!products.length) {
    tg.showAlert ? tg.showAlert("В избранном пока нет позиций.") : alert("В избранном пока нет позиций.");
    return;
  }
  const lines = products.map((product, index) => `${index + 1}. ${product.sku} — «${product.name}» — ${formatPrice(product.price)} BYN/сутки, ${product.qty} шт.`);
  openManagerWithText(`Здравствуйте! Интересуют позиции из избранного:\n\n${lines.join("\n")}\n\nПодскажите, пожалуйста, детали аренды.`);
}

document.getElementById("back-btn").addEventListener("click", goBack);
document.getElementById("nav-home").addEventListener("click", openHome);
document.getElementById("nav-favorites").addEventListener("click", openFavorites);
document.getElementById("nav-directory").addEventListener("click", openDirectory);
document.getElementById("ask-favorites-btn").addEventListener("click", askFavoritesManager);

let searchTimer;
document.getElementById("search-input").addEventListener("input", event => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentSearch = event.target.value;
    renderSearchResults();
  }, 160);
});

try { tg.BackButton.onClick(goBack); } catch (error) {}
loadCatalog();
