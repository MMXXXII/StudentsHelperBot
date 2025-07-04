const { User, Group, UserGroup, Task, Subject, GroupRequest, SubjectRequest } = require("../database/models")
const { getGroupMenuKeyboard, getTasksKeyboard, getPaginationKeyboard } = require("../utils/keyboards")
const { setUserState, getUserState, clearUserState } = require("../utils/userState")
const { Op } = require("sequelize")

async function handlePendingGroups(bot, chatId, user) {
  try {
    // Показываем группы, в которые пользователь может вступить
    const allGroups = await Group.findAll({
      where: { status: "active" },
      include: [
        {
          model: User,
          as: "Creator",
          attributes: ["first_name", "username"],
        },
      ],
    })

    // Находим группы, в которых пользователь НЕ состоит
    const userGroups = await UserGroup.findAll({
      where: { user_id: user.id },
      attributes: ["group_id"],
    })

    const userGroupIds = userGroups.map((ug) => ug.group_id)
    const availableGroups = allGroups.filter((group) => !userGroupIds.includes(group.id))

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

async function handleTasks(bot, chatId, user, data) {
  // Implementation for handling tasks
}

async function handleAddTask(bot, chatId, user, data) {
  // Implementation for handling add task
}

async function handleCompleteTask(bot, chatId, user, data) {
  // Implementation for handling complete task
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
    case "subject":
      if (data === "admin_subject_requests") {
        await showSubjectRequests(bot, chatId)
      }
      break
  }
}

async function showRoleManagement(bot, chatId) {
  const groups = await Group.findAll({
    where: { status: "active" },
    limit: 10,
  })

  if (groups.length === 0) {
    await bot.sendMessage(chatId, "Нет активных групп для управления ролями.")
    return
  }

  const keyboard = {
    inline_keyboard: [
      ...groups.map((group) => [{ text: `👥 ${group.name}`, callback_data: `manage_roles_${group.id}` }]),
      [{ text: "🔙 Назад к админ панели", callback_data: "back_to_admin" }],
    ],
  }

  await bot.sendMessage(chatId, "Выберите группу для управления ролями:", {
    reply_markup: keyboard,
  })
}

async function showGroupRequests(bot, chatId) {
  const requests = await GroupRequest.findAll({
    where: { status: "pending" },
    include: [{ model: User, attributes: ["first_name", "username"] }],
    order: [["createdAt", "DESC"]],
  })

  if (requests.length === 0) {
    await bot.sendMessage(chatId, "Нет заявок на создание групп.", {
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
    message += `👤 От: ${request.User.first_name} (@${request.User.username || "без username"})\n`
    message += `📅 ${request.createdAt.toLocaleDateString("ru-RU")}\n\n`
  })

  const keyboard = {
    inline_keyboard: [
      ...requests.map((request, index) => [
        { text: `✅ Принять "${request.group_name}"`, callback_data: `approve_group_${request.id}` },
        { text: `❌ Отклонить "${request.group_name}"`, callback_data: `reject_group_${request.id}` },
      ]),
      [{ text: "🔙 Назад", callback_data: "back_to_admin" }],
    ],
  }

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  })
}

async function showSubjectRequests(bot, chatId) {
  const requests = await SubjectRequest.findAll({
    where: { status: "pending" },
    include: [
      { model: User, attributes: ["first_name", "username"] },
      { model: Group, attributes: ["name"] },
    ],
    order: [["createdAt", "DESC"]],
  })

  if (requests.length === 0) {
    await bot.sendMessage(chatId, "Нет заявок на добавление предметов.", {
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Назад", callback_data: "back_to_admin" }]],
      },
    })
    return
  }

  let message = "📚 *Заявки на добавление предметов:*\n\n"

  requests.forEach((request, index) => {
    message += `${index + 1}. *${request.subject_name}*\n`
    message += `👥 Группа: ${request.Group.name}\n`
    message += `👤 От: ${request.User.first_name} (@${request.User.username || "без username"})\n`
    message += `📅 ${request.createdAt.toLocaleDateString("ru-RU")}\n\n`
  })

  const keyboard = {
    inline_keyboard: [
      ...requests.map((request, index) => [
        { text: `✅ Принять "${request.subject_name}"`, callback_data: `approve_subject_${request.id}` },
        { text: `❌ Отклонить "${request.subject_name}"`, callback_data: `reject_subject_${request.id}` },
      ]),
      [{ text: "🔙 Назад", callback_data: "back_to_admin" }],
    ],
  }

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  })
}

async function handleBackToGroups(bot, chatId, user) {
  try {
    const { getGroupSelectionKeyboard } = require("../utils/keyboards")

    const keyboard = await getGroupSelectionKeyboard(user.id)

    await bot.sendMessage(chatId, "Выберите группу:", {
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error("Ошибка при возврате к группам:", error)
    await bot.sendMessage(chatId, "Произошла ошибка.")
  }
}

async function handleSettings(bot, chatId, user, data) {
  // Implementation for handling settings
}

async function showSettings(bot, chatId, user) {
  // Implementation for showing settings
}

async function handleJoinGroup(bot, chatId, user, data) {
  const groupId = data.split("_")[2]

  try {
    const group = await Group.findByPk(groupId)
    if (!group) {
      await bot.sendMessage(chatId, "Группа не найдена.")
      return
    }

    // Проверяем, не состоит ли уже пользователь в группе
    const existingMembership = await UserGroup.findOne({
      where: { user_id: user.id, group_id: groupId },
    })

    if (existingMembership) {
      await bot.sendMessage(chatId, "Вы уже состоите в этой группе!")
      return
    }

    // Добавляем пользователя в группу
    await UserGroup.create({
      user_id: user.id,
      group_id: groupId,
      role: "member",
    })

    await bot.sendMessage(chatId, `✅ Вы успешно присоединились к группе "${group.name}"!`)

    // Показываем меню группы
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

function setupCallbacks(bot) {
  bot.on("callback_query", async (callbackQuery) => {
    const msg = callbackQuery.message
    const chatId = msg.chat.id
    const telegramId = callbackQuery.from.id
    const data = callbackQuery.data

    try {
      await bot.answerCallbackQuery(callbackQuery.id)

      const user = await User.findOne({ where: { telegram_id: telegramId } })
      if (!user) return

      // Обработка различных callback'ов
      if (data.startsWith("select_group_")) {
        await handleGroupSelection(bot, chatId, user, data)
      } else if (data.startsWith("group_menu_")) {
        await handleGroupMenu(bot, chatId, user, data)
      } else if (data === "add_group") {
        await handleAddGroup(bot, chatId, user)
      } else if (data === "pending_groups") {
        await handlePendingGroups(bot, chatId, user)
      } else if (data.startsWith("tasks_")) {
        await handleTasks(bot, chatId, user, data)
      } else if (data.startsWith("add_task_")) {
        await handleAddTask(bot, chatId, user, data)
      } else if (data.startsWith("complete_task_")) {
        await handleCompleteTask(bot, chatId, user, data)
      } else if (data.startsWith("admin_")) {
        await handleAdminActions(bot, chatId, user, data)
      } else if (data === "back_to_groups") {
        await handleBackToGroups(bot, chatId, user)
      } else if (data.startsWith("settings_")) {
        await handleSettings(bot, chatId, user, data)
      } else if (data.startsWith("manage_roles_")) {
        await handleRoleManagement(bot, chatId, user, data)
      } else if (data.startsWith("approve_group_")) {
        await handleGroupApproval(bot, chatId, user, data)
      } else if (data.startsWith("reject_group_")) {
        await handleGroupRejection(bot, chatId, user, data)
      } else if (data.startsWith("approve_subject_")) {
        await handleSubjectApproval(bot, chatId, user, data)
      } else if (data.startsWith("reject_subject_")) {
        await handleSubjectRejection(bot, chatId, user, data)
      } else if (data === "back_to_admin") {
        await showAdminPanel(bot, chatId, user)
      } else if (data.startsWith("toggle_role_")) {
        await handleToggleRole(bot, chatId, user, data)
      } else if (data.startsWith("join_group_")) {
        await handleJoinGroup(bot, chatId, user, data)
      }
    } catch (error) {
      console.error("Ошибка в callback handler:", error)
      await bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.")
    }
  })
}

async function handleGroupApproval(bot, chatId, user, data) {
  const requestId = data.split("_")[2]

  try {
    const request = await GroupRequest.findByPk(requestId, {
      include: [{ model: User }],
    })

    if (!request) {
      await bot.sendMessage(chatId, "Заявка не найдена.")
      return
    }

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

    await bot.sendMessage(chatId, `✅ Группа "${request.group_name}" успешно создана!`)

    // Уведомляем пользователя
    await bot.sendMessage(
      request.User.telegram_id,
      `🎉 Ваша заявка на создание группы "${request.group_name}" одобрена!\n\nВы назначены куратором группы.`,
    )

    // Возвращаемся к списку заявок
    setTimeout(() => showGroupRequests(bot, chatId), 1000)
  } catch (error) {
    console.error("Ошибка при одобрении группы:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при создании группы.")
  }
}

async function handleGroupRejection(bot, chatId, user, data) {
  const requestId = data.split("_")[2]

  try {
    const request = await GroupRequest.findByPk(requestId, {
      include: [{ model: User }],
    })

    if (!request) {
      await bot.sendMessage(chatId, "Заявка не найдена.")
      return
    }

    await request.update({ status: "rejected" })

    await bot.sendMessage(chatId, `❌ Заявка на группу "${request.group_name}" отклонена.`)

    // Уведомляем пользователя
    await bot.sendMessage(
      request.User.telegram_id,
      `😔 Ваша заявка на создание группы "${request.group_name}" отклонена администратором.`,
    )

    // Возвращаемся к списку заявок
    setTimeout(() => showGroupRequests(bot, chatId), 1000)
  } catch (error) {
    console.error("Ошибка при отклонении группы:", error)
    await bot.sendMessage(chatId, "Произошла ошибка.")
  }
}

async function handleSubjectApproval(bot, chatId, user, data) {
  const requestId = data.split("_")[2]

  try {
    const request = await SubjectRequest.findByPk(requestId, {
      include: [{ model: User }, { model: Group }],
    })

    if (!request) {
      await bot.sendMessage(chatId, "Заявка не найдена.")
      return
    }

    // Создаем предмет
    await Subject.create({
      name: request.subject_name,
      group_id: request.group_id,
      created_by: request.user_id,
      status: "active",
    })

    await request.update({ status: "approved" })

    await bot.sendMessage(chatId, `✅ Предмет "${request.subject_name}" добавлен в группу "${request.Group.name}"!`)

    // Уведомляем пользователя
    await bot.sendMessage(
      request.User.telegram_id,
      `🎉 Ваша заявка на добавление предмета "${request.subject_name}" в группу "${request.Group.name}" одобрена!`,
    )

    setTimeout(() => showSubjectRequests(bot, chatId), 1000)
  } catch (error) {
    console.error("Ошибка при одобрении предмета:", error)
    await bot.sendMessage(chatId, "Произошла ошибка.")
  }
}

async function handleSubjectRejection(bot, chatId, user, data) {
  const requestId = data.split("_")[2]

  try {
    const request = await SubjectRequest.findByPk(requestId, {
      include: [{ model: User }, { model: Group }],
    })

    if (!request) {
      await bot.sendMessage(chatId, "Заявка не найдена.")
      return
    }

    await request.update({ status: "rejected" })

    await bot.sendMessage(chatId, `❌ Заявка на предмет "${request.subject_name}" отклонена.`)

    // Уведомляем пользователя
    await bot.sendMessage(
      request.User.telegram_id,
      `😔 Ваша заявка на добавление предмета "${request.subject_name}" в группу "${request.Group.name}" отклонена.`,
    )

    setTimeout(() => showSubjectRequests(bot, chatId), 1000)
  } catch (error) {
    console.error("Ошибка при отклонении предмета:", error)
    await bot.sendMessage(chatId, "Произошла ошибка.")
  }
}

async function handleRoleManagement(bot, chatId, user, data) {
  const groupId = data.split("_")[2]

  const group = await Group.findByPk(groupId)
  if (!group) {
    await bot.sendMessage(chatId, "Группа не найдена.")
    return
  }

  const userGroups = await UserGroup.findAll({
    where: { group_id: groupId },
    include: [{ model: User, attributes: ["first_name", "username", "telegram_id"] }],
  })

  if (userGroups.length === 0) {
    await bot.sendMessage(chatId, "В группе нет участников.")
    return
  }

  let message = `👥 *Участники группы "${group.name}":*\n\n`

  userGroups.forEach((ug, index) => {
    const roleEmoji = ug.role === "curator" ? "👨‍💼" : "👤"
    const roleText = ug.role === "curator" ? "Куратор" : "Участник"

    message += `${index + 1}. ${roleEmoji} ${ug.User.first_name} (@${ug.User.username || "без username"})\n`
    message += `   Роль: ${roleText}\n\n`
  })

  const keyboard = {
    inline_keyboard: [
      ...userGroups.map((ug) => [
        {
          text: `${ug.role === "curator" ? "👤" : "👨‍💼"} ${ug.User.first_name} - ${ug.role === "curator" ? "Сделать участником" : "Сделать куратором"}`,
          callback_data: `toggle_role_${ug.user_id}_${groupId}`,
        },
      ]),
      [{ text: "🔙 Назад", callback_data: "admin_roles" }],
    ],
  }

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  })
}

async function showAdminPanel(bot, chatId, user) {
  const adminKeyboard = {
    inline_keyboard: [
      [{ text: "👥 Управление ролями", callback_data: "admin_roles" }],
      [{ text: "📝 Заявки на группы", callback_data: "admin_group_requests" }],
      [{ text: "📚 Заявки на предметы", callback_data: "admin_subject_requests" }],
      [{ text: "🔙 Назад", callback_data: "back_to_groups" }],
    ],
  }

  await bot.sendMessage(chatId, "Панель администратора:", {
    reply_markup: adminKeyboard,
  })
}

async function handleGroupSelection(bot, chatId, user, data) {
  const groupId = data.split("_")[2]
  const group = await Group.findByPk(groupId)

  if (!group) {
    await bot.sendMessage(chatId, "Группа не найдена.")
    return
  }

  // Проверяем, состоит ли пользователь в группе
  const userGroup = await UserGroup.findOne({
    where: { user_id: user.id, group_id: groupId },
  })

  if (!userGroup) {
    // Добавляем пользователя в группу как участника
    await UserGroup.create({
      user_id: user.id,
      group_id: groupId,
      role: "member",
    })
  }

  const keyboard = await getGroupMenuKeyboard(groupId, userGroup?.role || "member")

  await bot.editMessageText(`Группа: ${group.name}\n\nВыберите действие:`, {
    chat_id: chatId,
    message_id: msg.message_id,
    reply_markup: keyboard,
  })
}

async function handleGroupMenu(bot, chatId, user, data) {
  const action = data.split("_")[2]
  const groupId = data.split("_")[3]

  switch (action) {
    case "tasks":
      await showTasks(bot, chatId, user, groupId)
      break
    case "addtask":
      await startAddTask(bot, chatId, user, groupId)
      break
    case "settings":
      await showSettings(bot, chatId, user)
      break
  }
}

async function showTasks(bot, chatId, user, groupId) {
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
    await bot.sendMessage(chatId, "Задач пока нет.")
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
    message += `📚 ${task.Subject.name}\n`
    message += `📅 ${deadline.toLocaleDateString("ru-RU")}\n`
    message += `${status} (${daysLeft > 0 ? daysLeft + " дн." : "просрочено"})\n`
    message += `👤 ${task.Creator.first_name}\n\n`
  }

  const keyboard = getTasksKeyboard(tasks, groupId)

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  })
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

async function startAddTask(bot, chatId, user, groupId) {
  const subjects = await Subject.findAll({
    where: { group_id: groupId, status: "active" },
  })

  if (subjects.length === 0) {
    await bot.sendMessage(chatId, "В группе пока нет предметов. Добавьте предмет сначала.")
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
      [{ text: "➕ Добавить предмет", callback_data: `add_subject_${groupId}` }],
      [{ text: "🔙 Назад", callback_data: `select_group_${groupId}` }],
    ],
  }

  await bot.sendMessage(chatId, "Выберите предмет для задачи:", {
    reply_markup: keyboard,
  })
}

async function handleToggleRole(bot, chatId, user, data) {
  if (user.role !== "admin") {
    await bot.sendMessage(chatId, "У вас нет прав администратора.")
    return
  }

  const [, , userId, groupId] = data.split("_")

  try {
    const userGroup = await UserGroup.findOne({
      where: { user_id: userId, group_id: groupId },
      include: [{ model: User, attributes: ["first_name"] }],
    })

    if (!userGroup) {
      await bot.sendMessage(chatId, "Пользователь не найден в группе.")
      return
    }

    const newRole = userGroup.role === "curator" ? "member" : "curator"
    await userGroup.update({ role: newRole })

    const roleText = newRole === "curator" ? "куратором" : "участником"

    await bot.sendMessage(chatId, `✅ ${userGroup.User.first_name} теперь ${roleText} группы.`)

    // Возвращаемся к управлению ролями этой группы
    setTimeout(() => handleRoleManagement(bot, chatId, user, `manage_roles_${groupId}`), 1000)
  } catch (error) {
    console.error("Ошибка при изменении роли:", error)
    await bot.sendMessage(chatId, "Произошла ошибка при изменении роли.")
  }
}

module.exports = { setupCallbacks }
