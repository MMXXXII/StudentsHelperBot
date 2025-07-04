const { User, Group, GroupRequest, Subject, Task, SubjectRequest, UserGroup } = require("../database/models")
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
      case "sending_notification":
        await handleSendingNotification(bot, chatId, user, text, userState)
        break
      case "editing_group_description":
        await handleEditingGroupDescription(bot, chatId, user, text, userState)
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

async function handleSendingNotification(bot, chatId, user, text, userState) {
  try {
    const { groupId } = userState.data

    const group = await Group.findByPk(groupId)
    if (!group) {
      await bot.sendMessage(chatId, "Группа не найдена.")
      clearUserState(user.telegram_id)
      return
    }

    // Получаем всех участников группы
    const members = await UserGroup.findAll({
      where: { group_id: groupId },
      include: [{ model: User, where: { notifications_enabled: true } }],
    })

    if (members.length === 0) {
      await bot.sendMessage(chatId, "В группе нет участников с включенными уведомлениями.")
      clearUserState(user.telegram_id)
      return
    }

    // Фильтруем участников с включенными уведомлениями для группы
    const activeMembers = members.filter((member) => {
      const settings = member.User.settings || {}
      return settings[`group_${groupId}_notifications`] !== false
    })

    if (activeMembers.length === 0) {
      await bot.sendMessage(chatId, "Все участники группы отключили уведомления.")
      clearUserState(user.telegram_id)
      return
    }

    const notificationMessage =
      `📢 *Уведомление от куратора*\n\n` + `👥 Группа: ${group.name}\n` + `👨‍💼 От: ${user.first_name}\n\n` + `${text}`

    let successCount = 0
    let failCount = 0

    // Отправляем уведомление всем участникам
    for (const member of activeMembers) {
      try {
        await bot.sendMessage(member.User.telegram_id, notificationMessage, {
          parse_mode: "Markdown",
        })
        successCount++
      } catch (error) {
        console.error(`Ошибка отправки уведомления пользователю ${member.User.telegram_id}:`, error)
        failCount++
      }
    }

    clearUserState(user.telegram_id)

    let resultMessage = `✅ Уведомление отправлено!\n\n`
    resultMessage += `📊 Статистика:\n`
    resultMessage += `• Успешно: ${successCount}\n`
    if (failCount > 0) {
      resultMessage += `• Ошибок: ${failCount}\n`
    }
    resultMessage += `• Всего участников: ${members.length}\n`

    await bot.sendMessage(chatId, resultMessage)

    // Возвращаемся к меню группы
    setTimeout(async () => {
      const { getGroupMenuKeyboard } = require("../utils/keyboards")

      const userGroup = await UserGroup.findOne({
        where: { user_id: user.id, group_id: groupId },
      })

      const keyboard = await getGroupMenuKeyboard(groupId, userGroup?.role || "member")

      await bot.sendMessage(chatId, "Выберите действие:", {
        reply_markup: keyboard,
      })
    }, 2000)
  } catch (error) {
    console.error("Ошибка в handleSendingNotification:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при отправке уведомления.")
    clearUserState(user.telegram_id)
  }
}

async function handleEditingGroupDescription(bot, chatId, user, text, userState) {
  try {
    const { groupId } = userState.data

    const group = await Group.findByPk(groupId)
    if (!group) {
      await bot.sendMessage(chatId, "Группа не найдена.")
      clearUserState(user.telegram_id)
      return
    }

    // Обновляем описание группы
    await group.update({ description: text })

    clearUserState(user.telegram_id)

    await bot.sendMessage(chatId, `✅ Описание группы "${group.name}" успешно обновлено!`)

    // Возвращаемся к настройкам группы
    setTimeout(async () => {
      const { showGroupSettings } = require("./callbacks")
      await showGroupSettings(bot, chatId, user, groupId)
    }, 1500)
  } catch (error) {
    console.error("Ошибка в handleEditingGroupDescription:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при изменении описания.")
    clearUserState(user.telegram_id)
  }
}

// Остальные функции остаются без изменений...
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

    // Создаем группу сразу, без запроса описания
    const group = await Group.create({
      name: text,
      description: null, // Описание необязательно
      created_by: user.id,
      status: "active",
    })

    // Добавляем создателя как куратора
    await UserGroup.create({
      user_id: user.id,
      group_id: group.id,
      role: "curator",
    })

    clearUserState(user.telegram_id)

    await bot.sendMessage(chatId, `✅ Группа "${text}" успешно создана! Вы назначены куратором.`)

    // Показываем меню новой группы
    setTimeout(async () => {
      const { getGroupMenuKeyboard } = require("../utils/keyboards")
      const keyboard = await getGroupMenuKeyboard(group.id, "curator")

      await bot.sendMessage(chatId, `Добро пожаловать в группу "${group.name}"!\n\nВыберите действие:`, {
        reply_markup: keyboard,
      })
    }, 1500)
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
        status: data.needsApproval ? "pending" : "active",
      })

      clearUserState(user.telegram_id)

      if (data.needsApproval) {
        await bot.sendMessage(
          chatId,
          `✅ Задача "${data.title}" создана и отправлена куратору на одобрение!\n\n` +
            `📅 Дедлайн: ${deadline.toLocaleDateString("ru-RU")}\n` +
            `👥 Для: всей группы (ожидает одобрения)`,
        )
      } else {
        await bot.sendMessage(
          chatId,
          `✅ Задача "${data.title}" успешно создана!\n\n` +
            `📅 Дедлайн: ${deadline.toLocaleDateString("ru-RU")}\n` +
            `👥 Для: ${data.forGroup ? "всей группы" : "только вас"}`,
        )
      }

      // Возвращаемся к меню группы
      setTimeout(async () => {
        const { getGroupMenuKeyboard } = require("../utils/keyboards")

        const userGroup = await UserGroup.findOne({
          where: { user_id: user.id, group_id: data.groupId },
        })

        const keyboard = await getGroupMenuKeyboard(data.groupId, userGroup?.role || "member")

        await bot.sendMessage(chatId, "Выберите действие:", {
          reply_markup: keyboard,
        })
      }, 2000)
      break
  }
}

async function handleAddingSubject(bot, chatId, user, text, userState) {
  const { groupId, needsApproval, returnToTaskCreation } = userState.data

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
    const subject = await Subject.create({
      name: text,
      group_id: groupId,
      created_by: user.id,
      status: "active",
    })

    await bot.sendMessage(chatId, `✅ Предмет "${text}" успешно добавлен!`)

    // Если мы добавляли предмет в процессе создания задачи, возвращаемся к выбору предмета
    if (returnToTaskCreation) {
      clearUserState(user.telegram_id)

      setTimeout(async () => {
        // Показываем обновленный список предметов для создания задачи
        const subjects = await Subject.findAll({
          where: { group_id: groupId, status: "active" },
        })

        const keyboard = {
          inline_keyboard: [
            ...subjects.map((subj) => [
              {
                text: subj.name,
                callback_data: `select_subject_${subj.id}_${groupId}`,
              },
            ]),
            [{ text: "➕ Добавить еще предмет", callback_data: `add_subject_${groupId}` }],
            [{ text: "🔙 Назад", callback_data: `select_group_${groupId}` }],
          ],
        }

        await bot.sendMessage(chatId, "Теперь выберите предмет для задачи:", {
          reply_markup: keyboard,
        })
      }, 1500)

      return
    }
  }

  clearUserState(user.telegram_id)

  // Если не возвращаемся к созданию задачи, показываем меню группы
  if (!returnToTaskCreation) {
    setTimeout(async () => {
      const { getGroupMenuKeyboard } = require("../utils/keyboards")

      const userGroup = await UserGroup.findOne({
        where: { user_id: user.id, group_id: groupId },
      })

      const keyboard = await getGroupMenuKeyboard(groupId, userGroup?.role || "member")

      await bot.sendMessage(chatId, "Выберите действие:", {
        reply_markup: keyboard,
      })
    }, 2000)
  }
}

module.exports = { handleTextInput }
