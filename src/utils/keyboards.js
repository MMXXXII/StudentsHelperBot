const { Group, UserGroup, Subject, Task } = require("../database/models")

async function getGroupSelectionKeyboard(userId, page = 0) {
  try {
    const limit = 5
    const offset = page * limit

    const userGroups = await UserGroup.findAll({
      where: { user_id: userId },
      include: [{ model: Group }],
      limit: limit,
      offset: offset,
    })

    const totalGroups = await UserGroup.count({ where: { user_id: userId } })
    const totalPages = Math.ceil(totalGroups / limit)

    const keyboard = {
      inline_keyboard: [
        ...userGroups.map((ug) => [
          {
            text: ug.Group.name,
            callback_data: `select_group_${ug.Group.id}`,
          },
        ]),
        [
          { text: "➕ Добавить группу", callback_data: "add_group" },
          { text: "⏳ Ожидающие группы", callback_data: "pending_groups" },
        ],
      ],
    }

    // Добавляем пагинацию если нужно
    if (totalPages > 1) {
      const paginationRow = []
      if (page > 0) {
        paginationRow.push({ text: "⬅️", callback_data: `groups_page_${page - 1}` })
      }
      paginationRow.push({ text: `${page + 1}/${totalPages}`, callback_data: "current_page" })
      if (page < totalPages - 1) {
        paginationRow.push({ text: "➡️", callback_data: `groups_page_${page + 1}` })
      }
      keyboard.inline_keyboard.push(paginationRow)
    }

    return keyboard
  } catch (error) {
    console.error("Ошибка в getGroupSelectionKeyboard:", error)
    return {
      inline_keyboard: [
        [{ text: "➕ Добавить группу", callback_data: "add_group" }],
        [{ text: "⏳ Ожидающие группы", callback_data: "pending_groups" }],
      ],
    }
  }
}

async function getGroupMenuKeyboard(groupId, userRole) {
  const keyboard = {
    inline_keyboard: [
      [{ text: "📋 Задачи", callback_data: `group_menu_tasks_${groupId}` }],
      [{ text: "➕ Добавить задачу", callback_data: `group_menu_addtask_${groupId}` }],
      [{ text: "✅ Отметить выполненное", callback_data: `group_menu_complete_${groupId}` }],
    ],
  }

  // Дополнительные кнопки для кураторов
  if (userRole === "curator") {
    keyboard.inline_keyboard.push(
      [{ text: "📢 Уведомление группе", callback_data: `group_menu_notify_${groupId}` }],
      [{ text: "📚 Управление предметами", callback_data: `group_menu_subjects_${groupId}` }],
    )
  }

  keyboard.inline_keyboard.push(
    [{ text: "⚙️ Настройки", callback_data: `group_menu_settings_${groupId}` }],
    [{ text: "🔙 К выбору группы", callback_data: "back_to_groups" }],
  )

  return keyboard
}

function getTasksKeyboard(tasks, groupId) {
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

  return keyboard
}

function getPaginationKeyboard(currentPage, totalPages, prefix) {
  const keyboard = []

  if (totalPages > 1) {
    const row = []
    if (currentPage > 0) {
      row.push({ text: "⬅️", callback_data: `${prefix}_${currentPage - 1}` })
    }
    row.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: "current_page" })
    if (currentPage < totalPages - 1) {
      row.push({ text: "➡️", callback_data: `${prefix}_${currentPage + 1}` })
    }
    keyboard.push(row)
  }

  return keyboard
}

module.exports = {
  getGroupSelectionKeyboard,
  getGroupMenuKeyboard,
  getTasksKeyboard,
  getPaginationKeyboard,
}
