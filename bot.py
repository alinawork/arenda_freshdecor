"""
Бот Fresh Decor — минимальная версия.

Делает только одно: на /start показывает кнопку, открывающую каталог
(мини-приложение Telegram).

Все заявки идут напрямую к менеджеру @AnastasiayaTrofimova через
кнопку «Уточнить» в карточке товара — бот в этом не участвует.

Запуск:
    pip install python-telegram-bot
    export BOT_TOKEN="токен_от_botfather"
    export WEBAPP_URL="https://polugore.github.io/arenda_freshdecor/"
    python3 bot.py
"""

import logging
import os

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler

BOT_TOKEN = os.environ["BOT_TOKEN"]
WEBAPP_URL = os.environ["WEBAPP_URL"]

logging.basicConfig(
    format="%(asctime)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)


async def start(update, context):
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton(
            "Открыть каталог декора",
            web_app=WebAppInfo(url=WEBAPP_URL),
        )
    ]])
    await update.message.reply_text(
        "Здравствуйте! Это Fresh Decor — аренда декора для мероприятий.\n\n"
        "Откройте каталог и выберите всё необходимое:",
        reply_markup=keyboard,
    )


def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    logging.info("Бот запущен")
    app.run_polling()


if __name__ == "__main__":
    main()
