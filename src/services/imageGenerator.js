const { createCanvas, loadImage } = require("canvas")
const fs = require("fs")
const path = require("path")

async function generateTaskListImage(tasks, groupName) {
  const canvas = createCanvas(800, 600)
  const ctx = canvas.getContext("2d")

  // Фон
  ctx.fillStyle = "#f8f9fa"
  ctx.fillRect(0, 0, 800, 600)

  // Заголовок
  ctx.fillStyle = "#2c3e50"
  ctx.font = "bold 28px Arial"
  ctx.textAlign = "center"
  ctx.fillText(`Задачи группы: ${groupName}`, 400, 50)

  // Линия под заголовком
  ctx.strokeStyle = "#3498db"
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(100, 70)
  ctx.lineTo(700, 70)
  ctx.stroke()

  let y = 120
  const lineHeight = 45

  tasks.slice(0, 10).forEach((task, index) => {
    const deadline = new Date(task.deadline)
    const now = new Date()
    const daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24))

    // Определяем цвет статуса
    let statusColor = "#27ae60" // зеленый
    let statusText = "🟢"

    if (daysLeft < 0) {
      statusColor = "#e74c3c" // красный
      statusText = "🔴"
    } else if (daysLeft <= 3) {
      statusColor = "#f39c12" // оранжевый
      statusText = "🟡"
    } else if (daysLeft <= 7) {
      statusColor = "#f39c12" // оранжевый
      statusText = "🟠"
    }

    // Номер задачи
    ctx.fillStyle = "#34495e"
    ctx.font = "bold 18px Arial"
    ctx.textAlign = "left"
    ctx.fillText(`${index + 1}.`, 50, y)

    // Название задачи
    ctx.fillStyle = "#2c3e50"
    ctx.font = "bold 20px Arial"
    ctx.fillText(task.title.substring(0, 40) + (task.title.length > 40 ? "..." : ""), 80, y)

    // Предмет
    ctx.fillStyle = "#7f8c8d"
    ctx.font = "16px Arial"
    ctx.fillText(`📚 ${task.Subject.name}`, 80, y + 20)

    // Дедлайн и статус
    ctx.fillStyle = statusColor
    ctx.font = "16px Arial"
    ctx.textAlign = "right"
    ctx.fillText(
      `${statusText} ${deadline.toLocaleDateString("ru-RU")} (${daysLeft > 0 ? daysLeft + " дн." : "просрочено"})`,
      750,
      y + 10,
    )

    y += lineHeight
  })

  // Если задач больше 10
  if (tasks.length > 10) {
    ctx.fillStyle = "#95a5a6"
    ctx.font = "16px Arial"
    ctx.textAlign = "center"
    ctx.fillText(`... и еще ${tasks.length - 10} задач`, 400, y + 20)
  }

  // Время генерации
  ctx.fillStyle = "#bdc3c7"
  ctx.font = "12px Arial"
  ctx.textAlign = "right"
  ctx.fillText(`Сгенерировано: ${new Date().toLocaleString("ru-RU")}`, 750, 580)

  return canvas.toBuffer("image/png")
}

module.exports = {
  generateTaskListImage,
}
