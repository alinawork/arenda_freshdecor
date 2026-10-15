/**
 * Fresh Decor — автозаполнение фото товаров.
 *
 * Что делает:
 * Для каждой строки на листе "Декор" (gid=1626650454):
 *   1. Берёт ссылку на Google Drive папку из колонки F
 *   2. Находит первое изображение в этой папке
 *   3. Записывает прямую ссылку на это фото в колонку N "Фото URL"
 *
 * Запуск: меню сверху "Fresh Decor" → "Обновить фото"
 *
 * Автоматизация: настраивается триггер "запускать раз в час" (см. setupTrigger).
 */

const SHEET_NAME = "Декор";          // имя листа в таблице
const PHOTO_URL_COLUMN = 14;          // колонка N (буква N = 14-я по счёту, A=1)
const FOLDER_LINK_COLUMN = 6;         // колонка F с ссылкой на папку
const SKU_COLUMN = 4;                 // колонка D — артикул
const START_ROW = 4;                  // данные начинаются с 4-й строки (3 строки шапки)

/**
 * Добавляет пункт меню в таблицу при открытии.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🌿 Fresh Decor")
    .addItem("Обновить фото (только новые)", "updateNewPhotos")
    .addItem("Перезаписать все фото", "updateAllPhotos")
    .addSeparator()
    .addItem("Настроить заголовок колонки N", "setupHeaderRow")
    .addItem("Установить автозапуск (раз в час)", "setupTrigger")
    .addItem("Удалить автозапуск", "removeTrigger")
    .addToUi();
}

/**
 * Обновляет фото только для тех строк, где колонка N пустая.
 * Это быстро (не трогает то, что уже заполнено).
 */
function updateNewPhotos() {
  processPhotos(false);
}

/**
 * Перезаписывает фото для ВСЕХ строк, даже если они уже заполнены.
 * Запускай если хочешь обновить картинки (например, поменял главное фото).
 */
function updateAllPhotos() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    "Перезаписать все фото?",
    "Это пройдётся по всем строкам и перезапишет колонку N. Может занять несколько минут.",
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;
  processPhotos(true);
}

/**
 * Основная логика: проходит по строкам и заполняет колонку N.
 */
function processPhotos(overwrite) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert(`Не нашёл лист "${SHEET_NAME}"`);
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < START_ROW) {
    SpreadsheetApp.getUi().alert("Нет данных для обработки");
    return;
  }

  // Сразу читаем все нужные колонки одним запросом (быстрее)
  const numRows = lastRow - START_ROW + 1;
  const data = sheet.getRange(START_ROW, 1, numRows, PHOTO_URL_COLUMN).getValues();

  let processed = 0;
  let updated = 0;
  let errors = 0;
  const startTime = Date.now();
  // Apps Script даёт 6 минут на запуск. Останавливаемся за 30 секунд до лимита.
  const MAX_RUNTIME_MS = 5.5 * 60 * 1000;

  for (let i = 0; i < data.length; i++) {
    // Защита от тайм-аута
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      Logger.log(`Дошёл до строки ${START_ROW + i}, выхожу по таймауту`);
      break;
    }

    const row = data[i];
    const sku = String(row[SKU_COLUMN - 1] || "").trim();
    const folderLink = String(row[FOLDER_LINK_COLUMN - 1] || "").trim();
    const currentPhotoUrl = String(row[PHOTO_URL_COLUMN - 1] || "").trim();

    // Артикул должен быть цифровой (00010, 00727)
    if (!/^\d+$/.test(sku)) continue;
    if (!folderLink) continue;
    if (!overwrite && currentPhotoUrl) continue;

    processed++;
    try {
      const photoUrl = getFirstPhotoUrl(folderLink);
      if (photoUrl) {
        // Записываем прямо в ячейку колонки N
        sheet.getRange(START_ROW + i, PHOTO_URL_COLUMN).setValue(photoUrl);
        updated++;
        Logger.log(`${sku}: ${photoUrl}`);
      } else {
        Logger.log(`${sku}: не нашёл фото в папке`);
      }
    } catch (e) {
      errors++;
      Logger.log(`${sku}: ошибка — ${e.message}`);
    }

    // Небольшая пауза чтобы Drive не ругался
    Utilities.sleep(150);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Обработано: ${processed}, обновлено: ${updated}, ошибок: ${errors}. ${elapsed} сек.`,
    "Готово",
    8
  );
}

/**
 * По ссылке на папку находит первое изображение и возвращает прямую URL.
 */
function getFirstPhotoUrl(folderLink) {
  const folderId = extractFolderId(folderLink);
  if (!folderId) return null;

  let folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (e) {
    return null; // папка недоступна
  }

  // Берём все файлы и ищем первый image
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const mime = file.getMimeType();
    if (mime && mime.startsWith("image/")) {
      const fileId = file.getId();
      // Прямая ссылка для встраивания в <img>
      // Этот формат работает для просмотра без авторизации, если файл публичный
      return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }
  }
  return null;
}

/**
 * Из ссылки вида https://drive.google.com/drive/folders/XXXX
 * достаём XXXX.
 */
function extractFolderId(url) {
  if (!url) return null;
  let m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return null;
}

/**
 * Один раз: записывает заголовок "Фото URL" в ячейку N1 (или куда нужно).
 */
function setupHeaderRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert(`Не нашёл лист "${SHEET_NAME}"`);
    return;
  }
  sheet.getRange(1, PHOTO_URL_COLUMN).setValue("Фото URL");
  sheet.getRange(2, PHOTO_URL_COLUMN).setValue("(заполняется автоматически)");
  SpreadsheetApp.getActiveSpreadsheet().toast("Заголовок установлен в N1", "Готово", 4);
}

/**
 * Включить автозапуск: раз в час Apps Script сам подхватит новые товары.
 */
function setupTrigger() {
  // Сначала удаляем старые триггеры этой функции
  removeTrigger(true);

  ScriptApp.newTrigger("updateNewPhotos")
    .timeBased()
    .everyHours(1)
    .create();

  SpreadsheetApp.getUi().alert(
    "Готово!",
    "Скрипт будет запускаться раз в час и проверять новые товары без фото. " +
    "Можно проверить во вкладке Триггеры (часики слева в Apps Script).",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Удалить автозапуск.
 */
function removeTrigger(silent) {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  for (const t of triggers) {
    if (t.getHandlerFunction() === "updateNewPhotos") {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  }
  if (!silent) {
    SpreadsheetApp.getUi().alert(`Удалено триггеров: ${removed}`);
  }
}
