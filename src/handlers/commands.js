const { User, Group, UserGroup } = require("../database/models")
const { getMainKeyboard, getGroupSelectionKeyboard } = require("../utils/keyboards")
const { getUserState, setUserState, clearUserState } = require("../utils/userState")

function setupCommands(bot) {
  // Команда /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id
    const telegramId = msg.from.id

    try {
      console.log(`Команда /start от пользователя ${telegramId}`)

      // Создаем или находим пользователя
      let user = await User.findOne({ where: { telegram_id: telegramId } })

      if (!user) {
        console.log("Создание нового пользователя")
        user = await User.create({
          telegram_id: telegramId,
          username: msg.from.username,
          first_name: msg.from.first_name,
          last_name: msg.from.last_name,
        })
      }

      // Проверяем, является ли пользователь администратором
      if (telegramId.toString() === process.env.ADMIN_TELEGRAM_ID) {
        await user.update({ role: "admin" })
        console.log("Пользователь назначен администратором")
      }

      const welcomeMessage = `Добро пожаловать, ${msg.from.first_name}! 👋\n\nВыберите группу для работы:`

      const keyboard = await getGroupSelectionKeyboard(user.id)

      await bot.sendMessage(chatId, welcomeMessage, {
        reply_markup: keyboard,
      })
    } catch (error) {
      console.error("Ошибка в команде /start:", error)
      await bot.sendMessage(chatId, "Произошла ошибка при запуске. Попробуйте позже.")
    }
  })

  // Команда /cancel
  bot.onText(/\/cancel/, async (msg) => {
    const chatId = msg.chat.id
    const telegramId = msg.from.id

    try {
      clearUserState(telegramId)

      await bot.sendMessage(chatId, "Действие отменено.", {
        reply_markup: { remove_keyboard: true },
      })

      // Возвращаем к выбору группы
      setTimeout(async () => {
        const user = await User.findOne({ where: { telegram_id: telegramId } })
        if (user) {
          const keyboard = await getGroupSelectionKeyboard(user.id)
          await bot.sendMessage(chatId, "Выберите группу:", {
            reply_markup: keyboard,
          })
        }
      }, 500)
    } catch (error) {
      console.error("Ошибка в команде /cancel:", error)
      await bot.sendMessage(chatId, "Произошла ошибка.")
    }
  })

  // Команда /admin (только для администраторов)
  bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id
    const telegramId = msg.from.id

    try {
      const user = await User.findOne({ where: { telegram_id: telegramId } })

      if (!user || user.role !== "admin") {
        await bot.sendMessage(chatId, "У вас нет прав администратора.")
        return
      }

      // Убираем дублирование - оставляем только один вызов
      const adminKeyboard = {
        inline_keyboard: [
          [{ text: "👥 Управление ролями", callback_data: "admin_roles" }],
          [{ text: "📝 Заявки на группы", callback_data: "admin_group_requests" }],
          [{ text: "🔙 Назад", callback_data: "back_to_groups" }],
        ],
      }

      await bot.sendMessage(chatId, "Панель администратора:", {
        reply_markup: adminKeyboard,
      })
    } catch (error) {
      console.error("Ошибка в команде /admin:", error)
      await bot.sendMessage(chatId, "Произошла ошибка.")
    }
  })

  // Обработка текстовых сообщений
  bot.on("message", async (msg) => {
    if (msg.text && !msg.text.startsWith("/")) {
      const chatId = msg.chat.id
      const telegramId = msg.from.id
      const userState = getUserState(telegramId)

      if (userState) {
        console.log(`Обработка текстового ввода от ${telegramId}:`, msg.text)
        const { handleTextInput } = require("./textHandlers")
        await handleTextInput(bot, msg, userState)
      }
    }
  })
}

module.exports = { setupCommands }
