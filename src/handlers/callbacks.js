const { User, Group, UserGroup, Task, Subject, GroupRequest, SubjectRequest, UserTask } = require("../database/models")
const {
  getGroupMenuKeyboard,
  getTasksKeyboard,
  getPaginationKeyboard,
  getGroupSelectionKeyboard,
} = require("../utils/keyboards")
const { setUserState, getUserState, clearUserState } = require("../utils/userState")
const { Op } = require("sequelize")

async function handleGroupSelection(bot, chatId, user, data, messageId = null) {
  try {
    const groupId = data.split("_")[2]
    console.log(`Пользователь ${user.id} выбирает группу ${groupId}`)

    const group = await Group.findByPk(groupId)
    if (!group) {
      await bot.sendMessage(chatId, "Группа не найдена.")
      return
    }

    // Проверяем, состоит ли пользователь в группе
    let userGroup = await UserGroup.findOne({
      where: { user_id: user.id, group_id: groupId },
    })

    if (!userGroup) {
      // Добавляем пользователя в группу как участника
      userGroup = await UserGroup.create({
        user_id: user.id,
        group_id: groupId,
        role: "member",
      })
      console.log(`Пользователь ${user.id} добавлен в группу ${groupId} как участник`)
    }

    const keyboard = await getGroupMenuKeyboard(groupId, userGroup.role)

    const message = `Группа: ${group.name}\n\nВыберите действие:`

    if (messageId) {
      // Редактируем существующее сообщение
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard,
      })
    } else {
      // Отправляем новое сообщение
      await bot.sendMessage(chatId, message, {
        reply_markup: keyboard,
      })
    }
  } catch (error) {
    console.error("Ошибка в handleGroupSelection:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при выборе группы.")
  }
}

async function handleAddSubject(bot, chatId, user, data) {
  try {
    const parts = data.split("_")
    const groupId = parts[2]
    const fromTaskCreation = parts[3] === "task" // Если вызвано из создания задачи

    console.log(`Добавление предмета в группу ${groupId}, из создания задачи: ${fromTaskCreation}`)

    // Проверяем роль пользователя в группе
    const userGroup = await UserGroup.findOne({
      where: { user_id: user.id, group_id: groupId },
    })

    if (!userGroup) {
      await bot.sendMessage(chatId, "Вы не состоите в этой группе.")
      return
    }

    const isCurator = userGroup.role === "curator"

    setUserState(user.telegram_id, {
      action: "adding_subject",
      step: "name",
      data: {
        groupId: groupId,
        needsApproval: !isCurator,
        returnToTaskCreation: fromTaskCreation, // Флаг для возврата к созданию задачи
      },
    })

    const message = isCurator
      ? "Введите название предмета:\n\n/cancel - отменить"
      : "Введите название предмета (потребуется одобрение куратора):\n\n/cancel - отменить"

    await bot.sendMessage(chatId, message, {
      reply_markup: { force_reply: true },
    })
  } catch (error) {
    console.error("Ошибка в handleAddSubject:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при добавлении предмета.")
  }
}

async function handleSelectSubject(bot, chatId, user, data) {
  try {
    const [, , subjectId, groupId] = data.split("_")
    console.log(`Выбран предмет ${subjectId} для группы ${groupId}`)

    const subject = await Subject.findByPk(subjectId)
    if (!subject) {
      await bot.sendMessage(chatId, "Предмет не найден.")
      return
    }

    // Проверяем роль пользователя
    const userGroup = await UserGroup.findOne({
      where: { user_id: user.id, group_id: groupId },
    })

    const isCurator = userGroup?.role === "curator"

    // Спрашиваем, для кого создается задача
    const keyboard = {
      inline_keyboard: [[{ text: "👤 Только для меня", callback_data: `task_for_me_${subjectId}_${groupId}` }]],
    }

    if (isCurator) {
      keyboard.inline_keyboard.unshift([
        { text: "👥 Для всей группы", callback_data: `task_for_group_${subjectId}_${groupId}` },
      ])
    } else {
      keyboard.inline_keyboard.push([
        { text: "📝 Для группы (с одобрением)", callback_data: `task_for_group_approval_${subjectId}_${groupId}` },
      ])
    }

    keyboard.inline_keyboard.push([{ text: "🔙 Назад", callback_data: `group_menu_addtask_${groupId}` }])

    await bot.sendMessage(chatId, `Предмет: ${subject.name}\n\nДля кого создать задачу?`, {
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка в handleSelectSubject:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при выборе предмета.")
  }
}

async function handleTaskCreationType(bot, chatId, user, data) {
  try {
    const parts = data.split("_")
    const type = parts[2] // 'for'
    const target = parts[3] // 'me', 'group', или 'group'
    const approval = parts[4] // может быть 'approval'
    const subjectId = parts[parts.length - 2]
    const groupId = parts[parts.length - 1]

    console.log(`Создание задачи: ${type}_${target}_${approval || ""} для предмета ${subjectId}`)

    const forGroup = target === "group"
    const needsApproval = approval === "approval"

    setUserState(user.telegram_id, {
      action: "adding_task",
      step: "title",
      data: {
        subjectId: subjectId,
        groupId: groupId,
        forGroup: forGroup,
        needsApproval: needsApproval,
      },
    })

    await bot.sendMessage(chatId, "Введите название задачи:\n\n/cancel - отменить", {
      reply_markup: { force_reply: true },
    })
  } catch (error) {
    console.error("Ошибка в handleTaskCreationType:", error)
    await bot.sendMessage(chatId, "Произошла оши��ка при создании задачи.")
  }
}

async function handleSubjectManagement(bot, chatId, user, groupId) {
  try {
    console.log(`Управление предметами для группы ${groupId}`)

    // Проверяем, является ли пользователь куратором
    const userGroup = await UserGroup.findOne({
      where: { user_id: user.id, group_id: groupId },
    })

    if (!userGroup || userGroup.role !== "curator") {
      await bot.sendMessage(chatId, "Только кураторы могут управлять предметами.")
      return
    }

    const subjects = await Subject.findAll({
      where: { group_id: groupId, status: "active" },
      include: [{ model: User, as: "Creator", attributes: ["first_name"] }],
    })

    if (subjects.length === 0) {
      await bot.sendMessage(chatId, "В группе пока нет предметов.", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "➕ Добавить предмет", callback_data: `add_subject_${groupId}` }],
            [{ text: "🔙 Назад", callback_data: `select_group_${groupId}` }],
          ],
        },
      })
      return
    }

    let message = "📚 *Предметы группы:*\n\n"

    subjects.forEach((subject, index) => {
      message += `${index + 1}. *${subject.name}*\n`
      message += `👤 Создал: ${subject.Creator?.first_name || "Неизвестно"}\n\n`
    })

    const keyboard = {
      inline_keyboard: [
        ...subjects.map((subject) => [
          { text: `🗑️ Удалить "${subject.name}"`, callback_data: `delete_subject_${subject.id}_${groupId}` },
        ]),
        [{ text: "➕ Добавить предмет", callback_data: `add_subject_${groupId}` }],
        [{ text: "🔙 Назад", callback_data: `select_group_${groupId}` }],
      ],
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка в handleSubjectManagement:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при управлении предметами.")
  }
}

async function handleDeleteSubject(bot, chatId, user, data) {
  try {
    const [, , subjectId, groupId] = data.split("_")

    const subject = await Subject.findByPk(subjectId)
    if (!subject) {
      await bot.sendMessage(chatId, "Предмет не найден.")
      return
    }

    // Проверяем, есть ли задачи по этому предмету
    const tasksCount = await Task.count({ where: { subject_id: subjectId } })

    if (tasksCount > 0) {
      await bot.sendMessage(
        chatId,
        `Нельзя удалить предмет "${subject.name}", так как по нему есть ${tasksCount} задач(и).`,
      )
      return
    }

    await subject.destroy()

    await bot.sendMessage(chatId, `✅ Предмет "${subject.name}" удален.`)

    // Возвращаемся к управлению предметами
    setTimeout(() => handleSubjectManagement(bot, chatId, user, groupId), 1000)
  } catch (error) {
    console.error("Ошибка в handleDeleteSubject:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при удалении предмета.")
  }
}

async function handleTaskDetails(bot, chatId, user, data) {
  try {
    const taskId = data.split("_")[2]

    const task = await Task.findByPk(taskId, {
      include: [
        { model: Subject, attributes: ["name"] },
        { model: User, as: "Creator", attributes: ["first_name"] },
        { model: Group, attributes: ["name"] },
      ],
    })

    if (!task) {
      await bot.sendMessage(chatId, "Задача не найдена.")
      return
    }

    // Проверяем, выполнена ли задача пользователем
    const userTask = await UserTask.findOne({
      where: { user_id: user.id, task_id: taskId },
    })

    const isCompleted = userTask?.completed || false
    const deadline = new Date(task.deadline)
    const now = new Date()
    const daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24))

    let status = ""
    if (daysLeft < 0) status = "🔴 Просрочено"
    else if (daysLeft <= 3) status = "🟡 Срочно"
    else if (daysLeft <= 7) status = "🟠 Скоро"
    else status = "🟢 Есть время"

    let message = `📋 *${task.title}*\n\n`
    message += `📚 Предмет: ${task.Subject?.name || "Без предмета"}\n`
    message += `📄 Описание: ${task.description || "Без описания"}\n`
    message += `📅 Дедлайн: ${deadline.toLocaleDateString("ru-RU")}\n`
    message += `${status} (${daysLeft > 0 ? daysLeft + " дн." : "просрочено"})\n`
    message += `👤 Создал: ${task.Creator?.first_name || "Неизвестно"}\n`
    message += `👥 Группа: ${task.Group?.name || "Неизвестно"}\n`
    message += `🎯 Для: ${task.for_group ? "всей группы" : "личная"}\n`
    message += `✅ Статус: ${isCompleted ? "Выполнено" : "Не выполнено"}\n`

    const keyboard = {
      inline_keyboard: [],
    }

    if (!isCompleted) {
      keyboard.inline_keyboard.push([
        { text: "✅ Отметить выполненной", callback_data: `complete_task_${taskId}_${task.group_id}` },
      ])
    }

    keyboard.inline_keyboard.push([{ text: "🔙 Назад к задачам", callback_data: `group_menu_tasks_${task.group_id}` }])

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка в handleTaskDetails:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при загрузке задачи.")
  }
}

// Остальные функции остаются без изменений...
async function handleGroupMenu(bot, chatId, user, data) {
  try {
    const action = data.split("_")[2]
    const groupId = data.split("_")[3]

    console.log(`Обработка меню группы: ${action} для группы ${groupId}`)

    switch (action) {
      case "tasks":
        await showTasks(bot, chatId, user, groupId)
        break
      case "addtask":
        await startAddTask(bot, chatId, user, groupId)
        break
      case "complete":
        await showCompleteTasks(bot, chatId, user, groupId)
        break
      case "notify":
        await startGroupNotification(bot, chatId, user, groupId)
        break
      case "subjects":
        await handleSubjectManagement(bot, chatId, user, groupId)
        break
      case "settings":
        await showGroupSettings(bot, chatId, user, groupId)
        break
      default:
        await bot.sendMessage(chatId, "Неизвестное действие.")
    }
  } catch (error) {
    console.error("Ошибка в handleGroupMenu:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при обработке меню.")
  }
}

async function showTasks(bot, chatId, user, groupId) {
  try {
    console.log(`Показ задач для группы ${groupId}`)

    const tasks = await Task.findAll({
      where: {
        group_id: groupId,
        [Op.or]: [{ for_group: true }, { created_by: user.id }],
      },
      include: [
        { model: Subject, attributes: ["name"] },
        { model: User, as: "Creator", attributes: ["first_name"] },
      ],
      order: [["deadline", "ASC"]],
    })

    if (tasks.length === 0) {
      await bot.sendMessage(chatId, "Задач пока нет.", {
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Назад", callback_data: `select_group_${groupId}` }]],
        },
      })
      return
    }

    let message = "📋 *Список задач:*\n\n"

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      const deadline = new Date(task.deadline)
      const now = new Date()
      const daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24))

      let status = ""
      if (daysLeft < 0) status = "🔴 Просрочено"
      else if (daysLeft <= 3) status = "🟡 Срочно"
      else if (daysLeft <= 7) status = "🟠 Скоро"
      else status = "🟢 Есть время"

      message += `${i + 1}. *${task.title}*\n`
      message += `📚 ${task.Subject?.name || "Без предмета"}\n`
      message += `📅 ${deadline.toLocaleDateString("ru-RU")}\n`
      message += `${status} (${daysLeft > 0 ? daysLeft + " дн." : "просрочено"})\n`
      message += `👤 ${task.Creator?.first_name || "Неизвестно"}\n\n`
    }

    const keyboard = {
      inline_keyboard: [
        ...tasks.slice(0, 10).map((task, index) => [
          {
            text: `${index + 1}. ${task.title}`,
            callback_data: `task_details_${task.id}`,
          },
        ]),
        [{ text: "🔙 Назад", callback_data: `select_group_${groupId}` }],
      ],
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка в showTasks:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при загрузке задач.")
  }
}

async function startAddTask(bot, chatId, user, groupId) {
  try {
    console.log(`Начало добавления задачи для группы ${groupId}`)

    const subjects = await Subject.findAll({
      where: { group_id: groupId, status: "active" },
    })

    if (subjects.length === 0) {
      await bot.sendMessage(chatId, "В группе пока нет предметов. Добавьте предмет сначала.", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "➕ Добавить предмет", callback_data: `add_subject_${groupId}_task` }], // Добавляем флаг _task
            [{ text: "🔙 Назад", callback_data: `select_group_${groupId}` }],
          ],
        },
      })
      return
    }

    const keyboard = {
      inline_keyboard: [
        ...subjects.map((subject) => [
          {
            text: subject.name,
            callback_data: `select_subject_${subject.id}_${groupId}`,
          },
        ]),
        [{ text: "➕ Добавить предмет", callback_data: `add_subject_${groupId}_task` }], // Добавляем флаг _task
        [{ text: "🔙 Назад", callback_data: `select_group_${groupId}` }],
      ],
    }

    await bot.sendMessage(chatId, "Выберите предмет для задачи:", {
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка в startAddTask:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при добавлении задачи.")
  }
}

async function showCompleteTasks(bot, chatId, user, groupId) {
  try {
    const tasks = await Task.findAll({
      where: {
        group_id: groupId,
        [Op.or]: [{ for_group: true }, { created_by: user.id }],
      },
      include: [
        { model: Subject, attributes: ["name"] },
        {
          model: User,
          through: {
            where: { user_id: user.id, completed: false },
            required: false,
          },
        },
      ],
      order: [["deadline", "ASC"]],
    })

    const incompleteTasks = tasks.filter((task) => {
      return !task.Users || task.Users.length === 0 || !task.Users[0].UserTask.completed
    })

    if (incompleteTasks.length === 0) {
      await bot.sendMessage(chatId, "Все задачи выполнены! 🎉", {
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Назад", callback_data: `select_group_${groupId}` }]],
        },
      })
      return
    }

    let message = "✅ *Отметить выполненные задачи:*\n\n"

    incompleteTasks.forEach((task, index) => {
      const deadline = new Date(task.deadline)
      message += `${index + 1}. *${task.title}*\n`
      message += `📚 ${task.Subject?.name || "Без предмета"}\n`
      message += `📅 ${deadline.toLocaleDateString("ru-RU")}\n\n`
    })

    const keyboard = {
      inline_keyboard: [
        ...incompleteTasks.slice(0, 10).map((task, index) => [
          {
            text: `✅ ${index + 1}. ${task.title}`,
            callback_data: `complete_task_${task.id}_${groupId}`,
          },
        ]),
        [{ text: "🔙 Назад", callback_data: `select_group_${groupId}` }],
      ],
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка в showCompleteTasks:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при загрузке задач.")
  }
}

async function startGroupNotification(bot, chatId, user, groupId) {
  try {
    console.log(`Отправка уведомления группе ${groupId}`)

    // Проверяем, является ли пользователь куратором
    const userGroup = await UserGroup.findOne({
      where: { user_id: user.id, group_id: groupId },
    })

    if (!userGroup || userGroup.role !== "curator") {
      await bot.sendMessage(chatId, "Только кураторы могут отправлять уведомления группе.")
      return
    }

    const group = await Group.findByPk(groupId)
    if (!group) {
      await bot.sendMessage(chatId, "Группа не найдена.")
      return
    }

    setUserState(user.telegram_id, {
      action: "sending_notification",
      step: "message",
      data: { groupId: groupId },
    })

    await bot.sendMessage(
      chatId,
      `📢 *Отправка уведомления группе "${group.name}"*\n\nВведите текст уведомления:\n\n/cancel - отменить`,
      {
        parse_mode: "Markdown",
        reply_markup: { force_reply: true },
      },
    )
  } catch (error) {
    console.error("Ошибка в startGroupNotification:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при отправке уведомления.")
  }
}

async function showGroupSettings(bot, chatId, user, groupId) {
  try {
    console.log(`Настройки группы ${groupId}`)

    const group = await Group.findByPk(groupId)
    if (!group) {
      await bot.sendMessage(chatId, "Группа не найдена.")
      return
    }

    const userGroup = await UserGroup.findOne({
      where: { user_id: user.id, group_id: groupId },
    })

    if (!userGroup) {
      await bot.sendMessage(chatId, "Вы не состоите в этой группе.")
      return
    }

    const isCurator = userGroup.role === "curator"

    // Получаем статистику группы
    const membersCount = await UserGroup.count({ where: { group_id: groupId } })
    const curatorsCount = await UserGroup.count({ where: { group_id: groupId, role: "curator" } })
    const subjectsCount = await Subject.count({ where: { group_id: groupId, status: "active" } })
    const tasksCount = await Task.count({ where: { group_id: groupId } })

    let message = `⚙️ *Настройки группы "${group.name}"*\n\n`
    message += `📊 *Статистика:*\n`
    message += `👥 Участников: ${membersCount}\n`
    message += `👨‍💼 Кураторов: ${curatorsCount}\n`
    message += `📚 Предметов: ${subjectsCount}\n`
    message += `📋 Задач: ${tasksCount}\n`
    message += `📅 Создана: ${group.createdAt.toLocaleDateString("ru-RU")}\n\n`

    const keyboard = {
      inline_keyboard: [
        [{ text: "👥 Участники группы", callback_data: `group_members_${groupId}` }],
        [{ text: "🔔 Мои уведомления", callback_data: `notification_settings_${groupId}` }],
      ],
    }

    if (isCurator) {
      keyboard.inline_keyboard.push(
        [{ text: "📊 Статистика задач", callback_data: `group_stats_${groupId}` }],
        [{ text: "🏷️ Изменить описание", callback_data: `edit_group_description_${groupId}` }],
        [{ text: "📋 Экспорт задач", callback_data: `export_tasks_${groupId}` }],
      )
    }

    keyboard.inline_keyboard.push([{ text: "🔙 Назад", callback_data: `select_group_${groupId}` }])

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка в showGroupSettings:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при загрузке настроек.")
  }
}

async function handleGroupMembers(bot, chatId, user, data) {
  try {
    const groupId = data.split("_")[2]

    const group = await Group.findByPk(groupId)
    if (!group) {
      await bot.sendMessage(chatId, "Группа не найдена.")
      return
    }

    const members = await UserGroup.findAll({
      where: { group_id: groupId },
      include: [{ model: User, attributes: ["first_name", "username", "telegram_id"] }],
      order: [
        ["role", "DESC"],
        ["joined_at", "ASC"],
      ],
    })

    if (members.length === 0) {
      await bot.sendMessage(chatId, "В группе нет участников.")
      return
    }

    let message = `👥 *Участники группы "${group.name}":*\n\n`

    members.forEach((member, index) => {
      const roleEmoji = member.role === "curator" ? "👨‍💼" : "👤"
      const roleText = member.role === "curator" ? "Куратор" : "Участник"

      message += `${index + 1}. ${roleEmoji} ${member.User.first_name}`
      if (member.User.username) {
        message += ` (@${member.User.username})`
      }
      message += `\n   ${roleText} • Присоединился: ${member.joined_at.toLocaleDateString("ru-RU")}\n\n`
    })

    const keyboard = {
      inline_keyboard: [[{ text: "🔙 Назад к настройкам", callback_data: `group_menu_settings_${groupId}` }]],
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка в handleGroupMembers:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при загрузке участников.")
  }
}

async function handleNotificationSettings(bot, chatId, user, data) {
  try {
    const groupId = data.split("_")[2]

    const group = await Group.findByPk(groupId)
    if (!group) {
      await bot.sendMessage(chatId, "Группа не найдена.")
      return
    }

    const currentSettings = user.settings || {}
    const groupNotifications = currentSettings[`group_${groupId}_notifications`] !== false

    let message = `🔔 *Настройки уведомлений*\n\n`
    message += `Группа: ${group.name}\n\n`
    message += `📋 Уведомления о задачах: ${groupNotifications ? "✅ Включены" : "❌ Отключены"}\n`
    message += `📅 Напоминания о дедлайнах: ${user.notifications_enabled ? "✅ Включены" : "❌ Отключены"}\n`
    message += `📢 Уведомления от кураторов: ${groupNotifications ? "✅ Включены" : "❌ Отключены"}\n\n`
    message += `*Типы уведомлений:*\n`
    message += `• За неделю до дедлайна\n`
    message += `• За 3 дня до дедлайна\n`
    message += `• Новые задачи для группы\n`
    message += `• Сообщения от кураторов\n`

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: groupNotifications ? "🔕 Отключить уведомления группы" : "🔔 Включить уведомления группы",
            callback_data: `toggle_group_notifications_${groupId}`,
          },
        ],
        [
          {
            text: user.notifications_enabled ? "🔕 Отключить все уведомления" : "🔔 Включить все уведомления",
            callback_data: `toggle_all_notifications_${groupId}`,
          },
        ],
        [{ text: "🔙 Назад к настройкам", callback_data: `group_menu_settings_${groupId}` }],
      ],
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка в handleNotificationSettings:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при загрузке настроек уведомлений.")
  }
}

async function handleToggleNotifications(bot, chatId, user, data) {
  try {
    const parts = data.split("_")
    const type = parts[1] // 'group' или 'all'
    const groupId = parts[parts.length - 1]

    if (type === "all") {
      // Переключаем все уведомления
      await user.update({
        notifications_enabled: !user.notifications_enabled,
      })

      const status = user.notifications_enabled ? "включены" : "отключены"
      await bot.sendMessage(chatId, `🔔 Все уведомления ${status}.`)
    } else if (type === "group") {
      // Переключаем уведомления для конкретной группы
      const currentSettings = user.settings || {}
      const settingKey = `group_${groupId}_notifications`
      const currentValue = currentSettings[settingKey] !== false

      currentSettings[settingKey] = !currentValue

      await user.update({ settings: currentSettings })

      const status = !currentValue ? "включены" : "отключены"
      await bot.sendMessage(chatId, `🔔 Уведомления группы ${status}.`)
    }

    // Обновляем настройки
    setTimeout(() => handleNotificationSettings(bot, chatId, user, `notification_settings_${groupId}`), 1000)
  } catch (error) {
    console.error("Ошибка в handleToggleNotifications:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при изменении настроек.")
  }
}

async function handleGroupStats(bot, chatId, user, data) {
  try {
    const groupId = data.split("_")[2]

    const group = await Group.findByPk(groupId)
    if (!group) {
      await bot.sendMessage(chatId, "Группа не найдена.")
      return
    }

    // Проверяем права куратора
    const userGroup = await UserGroup.findOne({
      where: { user_id: user.id, group_id: groupId },
    })

    if (!userGroup || userGroup.role !== "curator") {
      await bot.sendMessage(chatId, "Только кураторы могут просматривать статистику.")
      return
    }

    // Собираем статистику
    const totalTasks = await Task.count({ where: { group_id: groupId } })
    const activeTasks = await Task.count({ where: { group_id: groupId, status: "active" } })
    const completedTasks = await UserTask.count({
      where: { completed: true },
      include: [{ model: Task, where: { group_id: groupId } }],
    })

    const overdueTasks = await Task.count({
      where: {
        group_id: groupId,
        deadline: { [Op.lt]: new Date() },
        status: "active",
      },
    })

    const urgentTasks = await Task.count({
      where: {
        group_id: groupId,
        deadline: {
          [Op.between]: [new Date(), new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)],
        },
        status: "active",
      },
    })

    // Статистика по предметам
    const subjectStats = await Subject.findAll({
      where: { group_id: groupId, status: "active" },
      include: [
        {
          model: Task,
          attributes: [],
          required: false,
        },
      ],
      attributes: ["name", [require("sequelize").fn("COUNT", require("sequelize").col("Tasks.id")), "taskCount"]],
      group: ["Subject.id", "Subject.name"],
      raw: true,
    })

    let message = `📊 *Статистика группы "${group.name}"*\n\n`
    message += `📋 *Задачи:*\n`
    message += `• Всего: ${totalTasks}\n`
    message += `• Активных: ${activeTasks}\n`
    message += `• Выполнено: ${completedTasks}\n`
    message += `• Просрочено: ${overdueTasks}\n`
    message += `• Срочных (≤3 дня): ${urgentTasks}\n\n`

    if (subjectStats.length > 0) {
      message += `📚 *По предметам:*\n`
      subjectStats.forEach((subject) => {
        message += `• ${subject.name}: ${subject.taskCount} задач\n`
      })
      message += `\n`
    }

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    message += `📈 *Общая статистика:*\n`
    message += `• Процент выполнения: ${completionRate}%\n`
    message += `• Активность: ${overdueTasks === 0 ? "🟢 Хорошая" : overdueTasks <= 2 ? "🟡 Средняя" : "🔴 Низкая"}\n`

    const keyboard = {
      inline_keyboard: [
        [{ text: "📋 Детальный отчет", callback_data: `detailed_report_${groupId}` }],
        [{ text: "🔙 Назад к настройкам", callback_data: `group_menu_settings_${groupId}` }],
      ],
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка в handleGroupStats:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при загрузке статистики.")
  }
}

async function handleEditGroupDescription(bot, chatId, user, data) {
  try {
    const groupId = data.split("_")[3] // edit_group_description_${groupId}

    // Проверяем права куратора
    const userGroup = await UserGroup.findOne({
      where: { user_id: user.id, group_id: groupId },
    })

    if (!userGroup || userGroup.role !== "curator") {
      await bot.sendMessage(chatId, "Только кураторы могут изменять описание группы.")
      return
    }

    const group = await Group.findByPk(groupId)
    if (!group) {
      await bot.sendMessage(chatId, "Группа не найдена.")
      return
    }

    setUserState(user.telegram_id, {
      action: "editing_group_description",
      step: "description",
      data: { groupId: groupId },
    })

    let message = `🏷️ *Изменение описания группы "${group.name}"*\n\n`
    message += `Текущее описание: ${group.description || "Отсутствует"}\n\n`
    message += `Введите новое описание:\n\n/cancel - отменить`

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: { force_reply: true },
    })
  } catch (error) {
    console.error("Ошибка в handleEditGroupDescription:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при изменении описания.")
  }
}

async function handleExportTasks(bot, chatId, user, data) {
  try {
    const groupId = data.split("_")[2]

    // Проверяем права куратора
    const userGroup = await UserGroup.findOne({
      where: { user_id: user.id, group_id: groupId },
    })

    if (!userGroup || userGroup.role !== "curator") {
      await bot.sendMessage(chatId, "Только кураторы могут экспортировать задачи.")
      return
    }

    const group = await Group.findByPk(groupId)
    if (!group) {
      await bot.sendMessage(chatId, "Группа не найдена.")
      return
    }

    const tasks = await Task.findAll({
      where: { group_id: groupId },
      include: [
        { model: Subject, attributes: ["name"] },
        { model: User, as: "Creator", attributes: ["first_name"] },
      ],
      order: [["deadline", "ASC"]],
    })

    if (tasks.length === 0) {
      await bot.sendMessage(chatId, "В группе нет задач для экспорта.")
      return
    }

    let exportText = `📋 ЭКСПОРТ ЗАДАЧ ГРУППЫ "${group.name.toUpperCase()}"\n`
    exportText += `📅 Дата экспорта: ${new Date().toLocaleDateString("ru-RU")}\n`
    exportText += `📊 Всего задач: ${tasks.length}\n\n`
    exportText += `${"=".repeat(50)}\n\n`

    tasks.forEach((task, index) => {
      const deadline = new Date(task.deadline)
      const now = new Date()
      const daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24))

      let status = ""
      if (daysLeft < 0) status = "ПРОСРОЧЕНО"
      else if (daysLeft <= 3) status = "СРОЧНО"
      else if (daysLeft <= 7) status = "СКОРО"
      else status = "ЕСТЬ ВРЕМЯ"

      exportText += `${index + 1}. ${task.title}\n`
      exportText += `   Предмет: ${task.Subject?.name || "Без предмета"}\n`
      exportText += `   Описание: ${task.description || "Без описания"}\n`
      exportText += `   Дедлайн: ${deadline.toLocaleDateString("ru-RU")}\n`
      exportText += `   Статус: ${status}\n`
      exportText += `   Создал: ${task.Creator?.first_name || "Неизвестно"}\n`
      exportText += `   Для: ${task.for_group ? "всей группы" : "личная"}\n`
      exportText += `   ${"-".repeat(30)}\n\n`
    })

    exportText += `${"=".repeat(50)}\n`
    exportText += `Экспортировано из Telegram бота\n`
    exportText += `${new Date().toLocaleString("ru-RU")}`

    // Отправляем как файл
    await bot.sendDocument(chatId, Buffer.from(exportText, "utf8"), {
      filename: `tasks_${group.name}_${new Date().toISOString().split("T")[0]}.txt`,
      caption: `📋 Экспорт задач группы "${group.name}"`,
    })

    await bot.sendMessage(chatId, "✅ Задачи успешно экспортированы!")
  } catch (error) {
    console.error("Ошибка в handleExportTasks:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при экспорте задач.")
  }
}

// Обновляем setupCallbacks для добавления новых обработчиков
function setupCallbacks(bot) {
  bot.on("callback_query", async (callbackQuery) => {
    const msg = callbackQuery.message
    const chatId = msg.chat.id
    const telegramId = callbackQuery.from.id
    const data = callbackQuery.data

    try {
      await bot.answerCallbackQuery(callbackQuery.id)

      const user = await User.findOne({ where: { telegram_id: telegramId } })
      if (!user) {
        console.log("Пользователь не найден:", telegramId)
        return
      }

      console.log(`Обработка callback: ${data} от пользователя ${user.id}`)

      // Обработка различных callback'ов
      if (data.startsWith("select_group_")) {
        await handleGroupSelection(bot, chatId, user, data, msg.message_id)
      } else if (data.startsWith("group_menu_")) {
        await handleGroupMenu(bot, chatId, user, data)
      } else if (data === "add_group") {
        await handleAddGroup(bot, chatId, user)
      } else if (data === "pending_groups") {
        await handlePendingGroups(bot, chatId, user)
      } else if (data.startsWith("admin_")) {
        await handleAdminActions(bot, chatId, user, data)
      } else if (data.startsWith("approve_group_") || data.startsWith("reject_group_")) {
        await handleGroupRequestAction(bot, chatId, user, data)
      } else if (data === "back_to_groups") {
        await handleBackToGroups(bot, chatId, user)
      } else if (data.startsWith("join_group_")) {
        await handleJoinGroup(bot, chatId, user, data)
      } else if (data === "back_to_admin") {
        await showAdminPanel(bot, chatId, user)
      } else if (data.startsWith("complete_task_")) {
        await handleCompleteTask(bot, chatId, user, data)
      } else if (data.startsWith("add_subject_")) {
        await handleAddSubject(bot, chatId, user, data)
      } else if (data.startsWith("select_subject_")) {
        await handleSelectSubject(bot, chatId, user, data)
      } else if (data.startsWith("task_for_")) {
        await handleTaskCreationType(bot, chatId, user, data)
      } else if (data.startsWith("delete_subject_")) {
        await handleDeleteSubject(bot, chatId, user, data)
      } else if (data.startsWith("task_details_")) {
        await handleTaskDetails(bot, chatId, user, data)
      } else if (data.startsWith("group_members_")) {
        await handleGroupMembers(bot, chatId, user, data)
      } else if (data.startsWith("notification_settings_")) {
        await handleNotificationSettings(bot, chatId, user, data)
      } else if (data.startsWith("toggle_")) {
        await handleToggleNotifications(bot, chatId, user, data)
      } else if (data.startsWith("group_stats_")) {
        await handleGroupStats(bot, chatId, user, data)
      } else if (data.startsWith("edit_group_description_")) {
        await handleEditGroupDescription(bot, chatId, user, data)
      } else if (data.startsWith("export_tasks_")) {
        await handleExportTasks(bot, chatId, user, data)
      }
    } catch (error) {
      console.error("Ошибка в callback handler:", error)
      console.error("Stack trace:", error.stack)
      await bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.")
    }
  })
}

async function handleCompleteTask(bot, chatId, user, data) {
  try {
    const [, , taskId, groupId] = data.split("_")

    const task = await Task.findByPk(taskId, {
      include: [{ model: Subject, attributes: ["name"] }],
    })

    if (!task) {
      await bot.sendMessage(chatId, "Задача не найдена.")
      return
    }

    // Проверяем, не выполнена ли уже задача
    const existingUserTask = await UserTask.findOne({
      where: { user_id: user.id, task_id: taskId },
    })

    if (existingUserTask && existingUserTask.completed) {
      await bot.sendMessage(chatId, "Задача уже отмечена как выполненная!")
      return
    }

    // Отмечаем задачу как выполненную
    if (existingUserTask) {
      await existingUserTask.update({
        completed: true,
        completed_at: new Date(),
      })
    } else {
      await UserTask.create({
        user_id: user.id,
        task_id: taskId,
        completed: true,
        completed_at: new Date(),
      })
    }

    await bot.sendMessage(chatId, `✅ Задача "${task.title}" отмечена как выполненная!`)

    // Возвращаемся к списку задач для выполнения
    setTimeout(() => showCompleteTasks(bot, chatId, user, groupId), 1000)
  } catch (error) {
    console.error("Ошибка в handleCompleteTask:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при отметке задачи.")
  }
}

async function handlePendingGroups(bot, chatId, user) {
  try {
    console.log("Обработка ожидающих групп для пользователя:", user.id)

    const allGroups = await Group.findAll({
      where: { status: "active" },
      include: [
        {
          model: User,
          as: "Creator",
          attributes: ["first_name", "username"],
          required: false,
        },
      ],
    })

    console.log("Найдено групп:", allGroups.length)

    const userGroups = await UserGroup.findAll({
      where: { user_id: user.id },
      attributes: ["group_id"],
    })

    const userGroupIds = userGroups.map((ug) => ug.group_id)
    const availableGroups = allGroups.filter((group) => !userGroupIds.includes(group.id))

    console.log("Доступных групп:", availableGroups.length)

    if (availableGroups.length === 0) {
      await bot.sendMessage(
        chatId,
        "Нет доступных групп для присоединения.\n\nВы уже состоите во всех существующих группах.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "➕ Создать новую группу", callback_data: "add_group" }],
              [{ text: "🔙 К выбору группы", callback_data: "back_to_groups" }],
            ],
          },
        },
      )
      return
    }

    let message = "🔍 *Доступные группы для присоединения:*\n\n"

    availableGroups.forEach((group, index) => {
      message += `${index + 1}. *${group.name}*\n`
      message += `📄 ${group.description || "Без описания"}\n`
      message += `👤 Создатель: ${group.Creator?.first_name || "Неизвестно"}\n`
      message += `📅 Создана: ${group.createdAt.toLocaleDateString("ru-RU")}\n\n`
    })

    const keyboard = {
      inline_keyboard: [
        ...availableGroups.slice(0, 5).map((group) => [
          {
            text: `🚀 Присоединиться к "${group.name}"`,
            callback_data: `join_group_${group.id}`,
          },
        ]),
        [{ text: "➕ Создать новую группу", callback_data: "add_group" }],
        [{ text: "🔙 К выбору группы", callback_data: "back_to_groups" }],
      ],
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка при показе доступных групп:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при загрузке списка групп.")
  }
}

async function handleAdminActions(bot, chatId, user, data) {
  if (user.role !== "admin") {
    await bot.sendMessage(chatId, "У вас нет прав администратора.")
    return
  }

  const action = data.split("_")[1]

  switch (action) {
    case "roles":
      await showRoleManagement(bot, chatId)
      break
    case "group":
      if (data === "admin_group_requests") {
        await showGroupRequests(bot, chatId)
      }
      break
    default:
      await bot.sendMessage(chatId, "Неизвестное действие.")
  }
}

async function showRoleManagement(bot, chatId) {
  await bot.sendMessage(chatId, "Управление ролями в разработке.", {
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 Назад", callback_data: "back_to_admin" }]],
    },
  })
}

async function showGroupRequests(bot, chatId) {
  try {
    const requests = await GroupRequest.findAll({
      where: { status: "pending" },
      include: [{ model: User, attributes: ["first_name", "username"] }],
      order: [["createdAt", "DESC"]],
    })

    if (requests.length === 0) {
      await bot.sendMessage(chatId, "Нет ожидающих заявок на создание групп.", {
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Назад", callback_data: "back_to_admin" }]],
        },
      })
      return
    }

    let message = "📝 *Заявки на создание групп:*\n\n"

    requests.forEach((request, index) => {
      message += `${index + 1}. *${request.group_name}*\n`
      message += `📄 ${request.description || "Без описания"}\n`
      message += `👤 От: ${request.User.first_name}`
      if (request.User.username) {
        message += ` (@${request.User.username})`
      }
      message += `\n📅 ${request.createdAt.toLocaleDateString("ru-RU")}\n\n`
    })

    const keyboard = {
      inline_keyboard: [
        ...requests.slice(0, 5).map((request) => [
          { text: `✅ Одобрить "${request.group_name}"`, callback_data: `approve_group_${request.id}` },
          { text: `❌ Отклонить "${request.group_name}"`, callback_data: `reject_group_${request.id}` },
        ]),
        [{ text: "🔙 Назад", callback_data: "back_to_admin" }],
      ],
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка в showGroupRequests:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при загрузке заявок.")
  }
}

async function handleGroupRequestAction(bot, chatId, user, data) {
  try {
    const parts = data.split("_")
    const action = parts[0] // approve или reject
    const requestId = parts[2]

    const request = await GroupRequest.findByPk(requestId, {
      include: [{ model: User, attributes: ["first_name", "telegram_id"] }],
    })

    if (!request) {
      await bot.sendMessage(chatId, "Заявка не найдена.")
      return
    }

    if (action === "approve") {
      // Создаем группу
      const group = await Group.create({
        name: request.group_name,
        description: request.description,
        created_by: request.user_id,
        status: "active",
      })

      // Добавляем создателя как куратора
      await UserGroup.create({
        user_id: request.user_id,
        group_id: group.id,
        role: "curator",
      })

      // Обновляем статус заявки
      await request.update({ status: "approved" })

      await bot.sendMessage(chatId, `✅ Группа "${request.group_name}" одобрена и создана!`)

      // Уведомляем пользователя
      try {
        await bot.sendMessage(
          request.User.telegram_id,
          `🎉 Ваша заявка на создание группы "${request.group_name}" одобрена!\n\nВы назначены куратором группы. Используйте /start для доступа к группе.`,
        )
      } catch (error) {
        console.error("Ошибка уведомления пользователя:", error)
      }
    } else if (action === "reject") {
      await request.update({ status: "rejected" })

      await bot.sendMessage(chatId, `❌ Заявка на группу "${request.group_name}" отклонена.`)

      // Уведомляем пользователя
      try {
        await bot.sendMessage(
          request.User.telegram_id,
          `😔 Ваша заявка на создание группы "${request.group_name}" была отклонена администратором.`,
        )
      } catch (error) {
        console.error("Ошибка уведомления пользователя:", error)
      }
    }

    // Показываем обновленный список заявок
    setTimeout(() => showGroupRequests(bot, chatId), 1000)
  } catch (error) {
    console.error("Ошибка в handleGroupRequestAction:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при обработке заявки.")
  }
}

async function handleBackToGroups(bot, chatId, user) {
  try {
    const keyboard = await getGroupSelectionKeyboard(user.id)

    await bot.sendMessage(chatId, "Выберите группу:", {
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка при возврате к группам:", error)
    await bot.sendMessage(chatId, "Произошла ошибка.")
  }
}

async function handleJoinGroup(bot, chatId, user, data) {
  const groupId = data.split("_")[2]

  try {
    const group = await Group.findByPk(groupId)
    if (!group) {
      await bot.sendMessage(chatId, "Группа не найдена.")
      return
    }

    const existingMembership = await UserGroup.findOne({
      where: { user_id: user.id, group_id: groupId },
    })

    if (existingMembership) {
      await bot.sendMessage(chatId, "Вы уже состоите в этой группе!")
      return
    }

    await UserGroup.create({
      user_id: user.id,
      group_id: groupId,
      role: "member",
    })

    await bot.sendMessage(chatId, `✅ Вы успешно присоединились к группе "${group.name}"!`)

    setTimeout(async () => {
      const keyboard = await getGroupMenuKeyboard(groupId, "member")
      await bot.sendMessage(chatId, `Добро пожаловать в группу "${group.name}"!\n\nВыберите действие:`, {
        reply_markup: keyboard,
      })
    }, 1000)
  } catch (error) {
    console.error("Ошибка при присоединении к группе:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при присоединении к группе.")
  }
}

async function handleAddGroup(bot, chatId, user) {
  setUserState(user.telegram_id, {
    action: "adding_group",
    step: "name",
  })

  await bot.sendMessage(chatId, "Введите название новой группы:\n\n/cancel - отменить", {
    reply_markup: { force_reply: true },
  })
}

async function showAdminPanel(bot, chatId, user) {
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
}

module.exports = { setupCallbacks }
