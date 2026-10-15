"""
Конвертер Google Sheets → JSON-каталог.

Берёт лист "Декор" (gid=1626650454) из публичной таблицы FreshDecor,
обрабатывает его и сохраняет в data.json (в корне репозитория).

Совместим с Python 3.9+.
"""

import csv
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

SHEET_ID = "11Yb25NFT5GpUvPG720evup5SC4dLXq9pOI38SxGWPbM"
GID = "1626650454"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}"

# Все файлы лежат в одной директории — рядом с этим скриптом
ROOT = Path(__file__).parent
DATA_PATH = ROOT / "data.json"
PHOTOS_DIR = ROOT / "photos"

# Структура столбцов (нумерация с 0):
# A=Фото, B=Категория, C=Подкатегория, D=Артикул, E=Название,
# F=Ссылка на изделие, G=Кол-во, H=Закупка (НЕ БЕРЁМ), I=Аренда,
# J=Примечания, K=Статус, L=Дата брони, M=Место хранения
COL_CATEGORY = 1
COL_SUBCATEGORY = 2
COL_SKU = 3
COL_NAME = 4
COL_LINK = 5
COL_QTY = 6
# COL_PURCHASE = 7   <-- сознательно пропускаем
COL_RENT = 8
COL_NOTES = 9
COL_STATUS = 10
COL_BOOKED_UNTIL = 11
# COL_STORAGE = 12  (M=Место хранения, не используем)
COL_PHOTO_URL = 13  # N — Фото URL (заполняется Apps Script автоматически)


def fetch_csv(url):
    print(f"Скачиваю {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8")


def clean_qty(raw):
    """Превращает '1) 8шт 2) 7шт' или '13' в число (суммарное)."""
    if not raw:
        return 0
    raw = raw.strip()
    if raw.isdigit():
        return int(raw)
    nums = re.findall(r"(\d+)\s*шт", raw)
    if nums:
        return sum(int(n) for n in nums)
    nums = re.findall(r"\d+", raw)
    return int(nums[0]) if nums else 0


def clean_price(raw):
    """Превращает '1 490,00' или '6' в число."""
    if not raw:
        return 0
    raw = raw.replace("\xa0", "").replace(" ", "").replace(",", ".").strip()
    try:
        return float(raw)
    except ValueError:
        return 0


def find_photo(sku, photo_url_from_sheet):
    """
    Возвращает источник фото в порядке приоритета:
    1. URL из колонки N таблицы (заполняется Apps Script)
    2. Локальный файл в папке photos/{sku}.{ext}
    3. None — заглушка в приложении
    """
    # 1. URL из таблицы — высший приоритет (заполняется Apps Script)
    if photo_url_from_sheet and photo_url_from_sheet.startswith("http"):
        return photo_url_from_sheet

    # 2. Локальный файл (если использовали download_photos.py)
    if PHOTOS_DIR.exists():
        for ext in (".jpg", ".jpeg", ".png", ".webp"):
            if (PHOTOS_DIR / f"{sku}{ext}").exists():
                return f"photos/{sku}{ext}"
    return None


def parse_row(row):
    if len(row) <= COL_NAME:
        return None
    sku = row[COL_SKU].strip() if len(row) > COL_SKU else ""
    name = row[COL_NAME].strip() if len(row) > COL_NAME else ""
    if not sku or not name:
        return None
    if not re.match(r"^\d+$", sku):
        return None

    status_raw = row[COL_STATUS].strip().lower() if len(row) > COL_STATUS else ""
    booked_until = row[COL_BOOKED_UNTIL].strip() if len(row) > COL_BOOKED_UNTIL else ""
    is_booked = "брон" in status_raw
    photo_url = row[COL_PHOTO_URL].strip() if len(row) > COL_PHOTO_URL else ""

    return {
        "sku": sku,
        "name": name,
        "category": row[COL_CATEGORY].strip() if len(row) > COL_CATEGORY else "",
        "subcategory": row[COL_SUBCATEGORY].strip() if len(row) > COL_SUBCATEGORY else "",
        "qty": clean_qty(row[COL_QTY] if len(row) > COL_QTY else ""),
        "price": clean_price(row[COL_RENT] if len(row) > COL_RENT else ""),
        "notes": row[COL_NOTES].strip() if len(row) > COL_NOTES else "",
        "drive_link": row[COL_LINK].strip() if len(row) > COL_LINK else "",
        "photo": find_photo(sku, photo_url),
        "booked": is_booked,
        "booked_until": booked_until if is_booked else "",
    }


def main():
    try:
        csv_text = fetch_csv(CSV_URL)
    except Exception as e:
        print(f"Ошибка при скачивании: {e}", file=sys.stderr)
        sys.exit(1)

    reader = csv.reader(io.StringIO(csv_text))
    all_rows = list(reader)
    print(f"Прочитано строк: {len(all_rows)}")

    products = []
    for row in all_rows[3:]:
        item = parse_row(row)
        if item and item["price"] > 0:
            products.append(item)

    print(f"Обработано товаров: {len(products)}")

    categories = {}
    for p in products:
        cat, sub = p["category"], p["subcategory"]
        if not cat:
            continue
        categories.setdefault(cat, set()).add(sub)
    categories_list = [
        {"name": cat, "subcategories": sorted(s for s in subs if s)}
        for cat, subs in sorted(categories.items())
    ]

    data = {
        "products": products,
        "categories": categories_list,
        "total": len(products),
    }

    DATA_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Записано в {DATA_PATH}")
    print(f"Категорий: {len(categories_list)}")
    print(f"Забронировано: {sum(1 for p in products if p['booked'])}")


if __name__ == "__main__":
    main()
