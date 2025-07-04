const cron = require("node-cron")
const { Task, User, UserGroup, Subject } = require("../database/models")
const { Op } = require("sequelize")

function startNotificationScheduler(bot) {
  // Проверяем каждый день в 9:00
  cron.schedule("0 9 * * *", async () => {
    await sendDeadlineNotifications(bot)
  })

  console.log("Планировщик уведомлений запущен")
}

async function sendDeadlineNotifications(bot) {
  try {
    const now = new Date()
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

    // Находим задачи с дедлайном через неделю
    const weekTasks = await Task.findAll({
      where: {
        deadline: {
          [Op.between]: [now, weekFromNow],
        },
        status: "active",
      },
      include: [
        { model: Subject, attributes: ["name"] },
        { model: User, as: "Creator", attributes: ["first_name"] },
      ],
    })

    // Находим задачи с дедлайном через 3 дня или меньше
    const urgentTasks = await Task.findAll({
      where: {
        deadline: {
          [Op.between]: [now, threeDaysFromNow],
        },
        status: "active",
      },
      include: [
        { model: Subject, attributes: ["name"] },
        { model: User, as: "Creator", attributes: ["first_name"] },
      ],
    })

    // Отправляем уведомления
    await sendTaskNotifications(bot, weekTasks, "week")
    await sendTaskNotifications(bot, urgentTasks, "urgent")
  } catch (error) {
    console.error("Ошибка при отправке уведомлений:", error)
  }
}

async function sendTaskNotifications(bot, tasks, type) {
  for (const task of tasks) {
    try {
      // Находим всех пользователей, которым нужно отправить уведомление
      let users = []

      if (task.for_group) {
        // Задача для всей группы
        const userGroups = await UserGroup.findAll({
          where: { group_id: task.group_id },
          include: [{ model: User, where: { notifications_enabled: true } }],
        })
        users = userGroups.map((ug) => ug.User)
      } else {
        // Личная задача
        const user = await User.findByPk(task.created_by)
        if (user && user.notifications_enabled) {
          users = [user]
        }
      }

      const deadline = new Date(task.deadline)
      const daysLeft = Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24))

      const emoji = type === "urgent" ? "🔴" : "🟡"
      const urgencyText = type === "urgent" ? "СРОЧНО!" : "Напоминание"

      const message =
        `${emoji} ${urgencyText}\n\n` +
        `📋 Задача: ${task.title}\n` +
        `📚 Предмет: ${task.Subject.name}\n` +
        `📅 Дедлайн: ${deadline.toLocaleDateString("ru-RU")}\n` +
        `⏰ Осталось: ${daysLeft} дн.\n\n` +
        `Не забудьте выполнить задачу вовремя! 💪`

      for (const user of users) {
        try {
          await bot.sendMessage(user.telegram_id, message)
        } catch (error) {
          console.error(`Ошибка отправки уведомления пользователю ${user.telegram_id}:`, error)
        }
      }
    } catch (error) {
      console.error("Ошибка при обработке задачи:", error)
    }
  }
}

module.exports = {
  startNotificationScheduler,
  sendDeadlineNotifications,
}
