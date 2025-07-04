require("dotenv").config()
const TelegramBot = require("node-telegram-bot-api")
const { sequelize } = require("./database/models")
const { initializeDatabase } = require("./database/migrate")
const { setupCommands } = require("./handlers/commands")
const { setupCallbacks } = require("./handlers/callbacks")
const { startNotificationScheduler } = require("./services/notifications")

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

async function startBot() {
  try {
    // Инициализация базы данных
    await initializeDatabase()
    console.log("База данных инициализирована")

    // Настройка команд и обработчиков
    setupCommands(bot)
    setupCallbacks(bot)

    // Запуск планировщика уведомлений
    startNotificationScheduler(bot)

    console.log("Бот запущен успешно!")
  } catch (error) {
    console.error("Ошибка при запуске бота:", error)
    process.exit(1)
  }
}

// Обработка ошибок
bot.on("polling_error", (error) => {
  console.error("Polling error:", error)
})

process.on("SIGINT", async () => {
  console.log("Завершение работы бота...")
  await sequelize.close()
  process.exit(0)
})

startBot()
