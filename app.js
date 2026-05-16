// ===== Telegram Web App =====
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
try {
  tg.setHeaderColor("#ffffff");
  tg.setBackgroundColor("#ffffff");
  tg.MainButton.hide();
} catch (e) {}

// ===== Настройки =====
const MANAGER_USERNAME = "AnastasiayaTrofimova";  // без @

// ===== Состояние =====
let catalog = { products: [], categories: [] };
let currentChip = null;
let currentSearch = "";
const navStack = ["home"];
let currentProduct = null;

// ===== Загрузка =====
async function loadCatalog() {
  try {
    const response = await fetch("data.json?v=" + Date.now());
    if (!response.ok) throw new Error("HTTP " + response.status);
    catalog = await response.json();
    document.getElementById("catalog-loader").classList.add("hidden");
    renderChips();
    renderProducts();
  } catch (e) {
    console.error(e);
    document.getElementById("catalog-loader").textContent =
      "Не удалось загрузить каталог. Попробуйте позже.";
  }
}

// ===== Утилиты =====
function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function productImageHtml(p, big) {
  if (p.photo) {
    return `<img src="${escapeHtml(p.photo)}" alt="${escapeHtml(p.name)}" loading="lazy">`;
  }
  const size = big ? 48 : 28;
  const cls = big ? "detail-image-placeholder" : "product-card-placeholder";
  return `<div class="${cls}">
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="9" cy="9" r="2"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  </div>`;
}

// ===== Навигация =====
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(el => el.classList.add("hidden"));
  document.getElementById("screen-" + name).classList.remove("hidden");
  document.getElementById("back-btn").classList.toggle("hidden", name === "home");
  window.scrollTo(0, 0);
}

function pushScreen(name) {
  navStack.push(name);
  showScreen(name);
}

function goBack() {
  if (navStack.length <= 1) return;
  navStack.pop();
  showScreen(navStack[navStack.length - 1]);
}

// ===== Чипы-фильтры по подкатегориям =====
function renderChips() {
  const subs = new Set();
  catalog.products.forEach(p => { if (p.subcategory) subs.add(p.subcategory); });

  // Сортируем по количеству товаров (популярные слева)
  const counts = {};
  catalog.products.forEach(p => {
    if (p.subcategory) counts[p.subcategory] = (counts[p.subcategory] || 0) + 1;
  });
  const sorted = Array.from(subs).sort((a, b) => (counts[b] || 0) - (counts[a] || 0));

  const chips = [{ label: "Все", value: null }, ...sorted.map(s => ({ label: s, value: s }))];
  document.getElementById("chips-row").innerHTML = chips.map(c => {
    const active = (c.value === currentChip) ? "active" : "";
    return `<button class="chip ${active}" data-val="${escapeHtml(c.value || "")}">${escapeHtml(c.label)}</button>`;
  }).join("");

  document.getElementById("chips-row").querySelectorAll(".chip").forEach(btn => {
    btn.addEventListener("click", () => {
      currentChip = btn.dataset.val || null;
      renderChips();
      renderProducts();
    });
  });
}

// ===== Сетка товаров =====
function renderProducts() {
  let list = catalog.products;
  if (currentChip) list = list.filter(p => p.subcategory === currentChip);
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.subcategory || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
    );
  }

  const gridEl = document.getElementById("products-grid");
  const emptyEl = document.getElementById("products-empty");
  document.getElementById("catalog-count").textContent =
    list.length === catalog.products.length
      ? `${catalog.products.length} позиций`
      : `${list.length} из ${catalog.products.length}`;

  if (list.length === 0) {
    gridEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  gridEl.innerHTML = list.map(productCardHtml).join("");
  gridEl.querySelectorAll(".product-card").forEach(btn => {
    btn.addEventListener("click", () => openProduct(btn.dataset.sku));
  });
}

function productCardHtml(p) {
  return `
    <button class="product-card" data-sku="${escapeHtml(p.sku)}">
      <div class="product-card-image">
        ${productImageHtml(p, false)}
        ${p.booked ? `<span class="product-card-booking">до ${escapeHtml(p.booked_until || "")}</span>` : ""}
      </div>
      <div class="product-card-body">
        <div class="product-card-name">${escapeHtml(p.name)}</div>
        <div class="product-card-price">${p.price} BYN</div>
      </div>
    </button>
  `;
}

// ===== Карточка товара =====
function openProduct(sku) {
  const p = catalog.products.find(x => x.sku === sku);
  if (!p) return;
  currentProduct = p;

  const statusClass = p.booked ? "detail-chip--booked" : "detail-chip--available";
  const statusValue = p.booked
    ? `в брони${p.booked_until ? "<br>до " + escapeHtml(p.booked_until) : ""}`
    : "доступно";

  document.getElementById("product-detail").innerHTML = `
    <div class="detail-image">
      ${productImageHtml(p, true)}
      <button class="detail-close" id="detail-close" aria-label="Закрыть">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    ${p.subcategory ? `<span class="detail-category-chip">${escapeHtml(p.subcategory)}</span>` : ""}

    <div class="detail-sku">${escapeHtml(p.sku)}</div>
    <h2 class="detail-name">${escapeHtml(p.name)}</h2>

    <div class="detail-chips">
      <div class="detail-chip">
        <div class="detail-chip-label">Аренда</div>
        <div class="detail-chip-value">${p.price} BYN</div>
      </div>
      <div class="detail-chip">
        <div class="detail-chip-label">Кол-во</div>
        <div class="detail-chip-value">${p.qty} шт.</div>
      </div>
      <div class="detail-chip ${statusClass}">
        <div class="detail-chip-label">Статус</div>
        <div class="detail-chip-value">${statusValue}</div>
      </div>
    </div>

    ${p.notes ? `<div class="detail-notes">${escapeHtml(p.notes)}</div>` : ""}

    <div class="detail-cta">
      <button class="btn-dark" id="ask-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
        Уточнить у менеджера
      </button>
    </div>
  `;

  document.getElementById("detail-close").addEventListener("click", goBack);
  document.getElementById("ask-btn").addEventListener("click", () => askManager(p));
  pushScreen("product");
}

// ===== Переход в чат с менеджером =====
function askManager(p) {
  const text = `Здравствуйте! Интересует ${p.sku} «${p.name}» — ${p.price} BYN/сутки.`;
  const url = `https://t.me/${MANAGER_USERNAME}?text=${encodeURIComponent(text)}`;

  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");

  // openTelegramLink — нативный способ открыть чат внутри Telegram
  try {
    tg.openTelegramLink(url);
  } catch (e) {
    // Резервный путь — обычное открытие ссылки
    window.open(url, "_blank");
  }
}

// ===== События =====
document.getElementById("back-btn").addEventListener("click", goBack);

let searchTimer;
document.getElementById("search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentSearch = e.target.value.trim();
    renderProducts();
  }, 200);
});

tg.BackButton.onClick(goBack);

// ===== Запуск =====
loadCatalog();
