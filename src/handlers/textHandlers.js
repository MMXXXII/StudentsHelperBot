const { User, Group, GroupRequest, Subject, Task, SubjectRequest } = require("../database/models")
const { clearUserState, setUserState } = require("../utils/userState")

async function handleTextInput(bot, msg, userState) {
  const chatId = msg.chat.id
  const telegramId = msg.from.id
  const text = msg.text

  try {
    const user = await User.findOne({ where: { telegram_id: telegramId } })

    switch (userState.action) {
      case "adding_group":
        await handleAddingGroup(bot, chatId, user, text, userState)
        break
      case "adding_task":
        await handleAddingTask(bot, chatId, user, text, userState)
        break
      case "adding_subject":
        await handleAddingSubject(bot, chatId, user, text, userState)
        break
      default:
        clearUserState(telegramId)
        break
    }
  } catch (error) {
    console.error("Ошибка в handleTextInput:", error)
    await bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.")
    clearUserState(telegramId)
  }
}

async function handleAddingGroup(bot, chatId, user, text, userState) {
  if (userState.step === "name") {
    // Проверяем, не существует ли уже такая группа
    const existingGroup = await Group.findOne({ where: { name: text } })
    const existingRequest = await GroupRequest.findOne({
      where: { group_name: text, status: "pending" },
    })

    if (existingGroup || existingRequest) {
      await bot.sendMessage(
        chatId,
        "Группа с таким названием уже существует или заявка на неё уже подана. Введите другое название:",
      )
      return
    }

    setUserState(user.telegram_id, {
      action: "adding_group",
      step: "description",
      data: { name: text },
    })

    await bot.sendMessage(chatId, "Введите описание группы (необязательно):")
  } else if (userState.step === "description") {
    // Создаем заявку на группу
    await GroupRequest.create({
      group_name: userState.data.name,
      description: text,
      user_id: user.id,
    })

    clearUserState(user.telegram_id)

    await bot.sendMessage(
      chatId,
      `✅ Заявка на создание группы "${userState.data.name}" отправлена администратору на рассмотрение.`,
    )

    // Уведомляем администратора
    if (process.env.ADMIN_TELEGRAM_ID) {
      await bot.sendMessage(
        process.env.ADMIN_TELEGRAM_ID,
        `🆕 Новая заявка на создание группы:\n\n` +
          `📝 Название: ${userState.data.name}\n` +
          `📄 Описание: ${text}\n` +
          `👤 От: ${user.first_name} (@${user.username})\n\n` +
          `Используйте /admin для управления заявками.`,
      )
    }
  }
}

async function handleAddingTask(bot, chatId, user, text, userState) {
  const { step, data } = userState

  switch (step) {
    case "title":
      setUserState(user.telegram_id, {
        ...userState,
        step: "description",
        data: { ...data, title: text },
      })
      await bot.sendMessage(chatId, "Введите описание задачи:")
      break

    case "description":
      setUserState(user.telegram_id, {
        ...userState,
        step: "deadline",
        data: { ...data, description: text },
      })
      await bot.sendMessage(chatId, "Введите дедлайн в формате ДД.ММ.ГГГГ (например, 25.12.2024):")
      break

    case "deadline":
      const dateRegex = /^(\d{2})\.(\d{2})\.(\d{4})$/
      const match = text.match(dateRegex)

      if (!match) {
        await bot.sendMessage(chatId, "Неверный формат даты. Введите дату в формате ДД.ММ.ГГГГ:")
        return
      }

      const [, day, month, year] = match
      const deadline = new Date(year, month - 1, day)

      if (deadline < new Date()) {
        await bot.sendMessage(chatId, "Дедлайн не может быть в прошлом. Введите корректную дату:")
        return
      }

      // Создаем задачу
      const task = await Task.create({
        title: data.title,
        description: data.description,
        subject_id: data.subjectId,
        group_id: data.groupId,
        deadline: deadline,
        created_by: user.id,
        for_group: data.forGroup || false,
      })

      clearUserState(user.telegram_id)

      await bot.sendMessage(
        chatId,
        `✅ Задача "${data.title}" успешно создана!\n\n` +
          `📅 Дедлайн: ${deadline.toLocaleDateString("ru-RU")}\n` +
          `👥 Для: ${data.forGroup ? "всей группы" : "только вас"}`,
      )
      break
  }
}

async function handleAddingSubject(bot, chatId, user, text, userState) {
  const { groupId, needsApproval } = userState.data

  if (needsApproval) {
    // Создаем заявку на предмет
    await SubjectRequest.create({
      subject_name: text,
      group_id: groupId,
      user_id: user.id,
    })

    await bot.sendMessage(chatId, `✅ Заявка на добавление предмета "${text}" отправлена куратору группы.`)
  } else {
    // Создаем предмет сразу (пользователь - куратор)
    await Subject.create({
      name: text,
      group_id: groupId,
      created_by: user.id,
      status: "active",
    })

    await bot.sendMessage(chatId, `✅ Предмет "${text}" успешно добавлен!`)
  }

  clearUserState(user.telegram_id)
}

module.exports = { handleTextInput }
