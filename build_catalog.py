"""Обновляет data.json из публичного листа «Каталог» Google Sheets."""

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

ROOT = Path(__file__).parent
DATA_PATH = ROOT / "data.json"
PHOTOS_DIR = ROOT / "photos"

# Текущая структура листа «Каталог»:
# A Категория, B Подкатегория, C Артикул, D Фото, E Название,
# F Ссылка на изделие/конкретное фото, G Кол-во, H Закупка, I Аренда,
# J Примечания, K Статус, L Дата брони, M Место хранения, N Фото URL.
COL_CATEGORY = 0
COL_SUBCATEGORY = 1
COL_SKU = 2
COL_NAME = 4
COL_LINK = 5
COL_QTY = 6
COL_RENT = 8
COL_NOTES = 9
COL_STATUS = 10
COL_BOOKED_UNTIL = 11
COL_PHOTO_URL = 13
START_DATA_ROW = 2


def clean(value):
    return str(value or "").strip()


def get(row, index):
    return clean(row[index]) if index < len(row) else ""


def fetch_csv(url):
    print(f"Скачиваю таблицу: {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8-sig")


def clean_qty(value):
    value = clean(value)
    if not value:
        return 0
    if value.isdigit():
        return int(value)
    numbers = re.findall(r"(\d+)\s*шт", value.lower())
    if numbers:
        return sum(int(number) for number in numbers)
    numbers = re.findall(r"\d+", value)
    return int(numbers[0]) if numbers else 0


def clean_price(value):
    value = clean(value).replace("\xa0", "").replace(" ", "").replace(",", ".")
    if not value:
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def is_booked(status):
    status = clean(status).lower()
    return "брон" in status or "заброн" in status


def extract_google_drive_file_id(url):
    """Извлекает ID конкретного файла Google Drive, но не ID папки."""
    url = clean(url)
    if not url or "/folders/" in url:
        return ""

    patterns = (
        r"/file/d/([a-zA-Z0-9_-]+)",
        r"/thumbnail\?id=([a-zA-Z0-9_-]+)",
        r"/uc\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)",
        r"/open\?id=([a-zA-Z0-9_-]+)",
        r"[?&]id=([a-zA-Z0-9_-]+)",
    )
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return ""


def normalize_photo_url(url):
    """Преобразует ссылку на файл Drive в адрес, подходящий для <img>."""
    url = clean(url)
    if not url.startswith(("http://", "https://")):
        return ""

    file_id = extract_google_drive_file_id(url)
    if file_id:
        return f"https://drive.google.com/thumbnail?id={file_id}&sz=w1600"
    return url


def find_photo(sku, photo_url_from_sheet, product_link):
    """N → конкретный файл из F → локальный файл → пустое значение."""
    photo_url_from_sheet = clean(photo_url_from_sheet)
    if photo_url_from_sheet:
        return normalize_photo_url(photo_url_from_sheet)

    direct_photo = normalize_photo_url(product_link)
    if extract_google_drive_file_id(product_link) and direct_photo:
        return direct_photo

    if PHOTOS_DIR.exists():
        for extension in (".jpg", ".jpeg", ".png", ".webp"):
            if (PHOTOS_DIR / f"{sku}{extension}").exists():
                return f"photos/{sku}{extension}"
    return ""


def parse_row(row):
    sku = get(row, COL_SKU)
    name = get(row, COL_NAME)
    price = clean_price(get(row, COL_RENT))

    if not sku or not sku.isdigit() or not name or price <= 0:
        return None

    status = get(row, COL_STATUS)
    booked = is_booked(status)
    product_link = get(row, COL_LINK)

    return {
        "sku": sku.zfill(5),
        "name": name,
        "category": get(row, COL_CATEGORY),
        "subcategory": get(row, COL_SUBCATEGORY),
        "qty": clean_qty(get(row, COL_QTY)),
        "price": price,
        "notes": get(row, COL_NOTES),
        "drive_link": product_link,
        "photo": find_photo(sku, get(row, COL_PHOTO_URL), product_link),
        "booked": booked,
        "booked_until": get(row, COL_BOOKED_UNTIL) if booked else "",
    }


def main():
    try:
        csv_text = fetch_csv(CSV_URL)
    except Exception as error:
        print(f"Ошибка при скачивании таблицы: {error}", file=sys.stderr)
        raise SystemExit(1) from error

    rows = list(csv.reader(io.StringIO(csv_text)))
    products = []
    for row in rows[START_DATA_ROW:]:
        product = parse_row(row)
        if product:
            products.append(product)

    categories = sorted(
        {
            product["subcategory"]
            for product in products
            if product.get("subcategory")
        }
    )
    booked_count = sum(1 for product in products if product.get("booked"))

    data = {
        "products": products,
        "categories": categories,
        "total": len(products),
        "booked": booked_count,
    }
    DATA_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Прочитано строк: {len(rows)}")
    print(f"Обработано товаров: {len(products)}")
    print(f"Категорий: {len(categories)}")
    print(f"Забронировано: {booked_count}")
    print(f"data.json обновлён: {DATA_PATH}")


if __name__ == "__main__":
    main()
