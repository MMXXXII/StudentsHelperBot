const { sequelize } = require("./models")

async function initializeDatabase() {
  try {
    await sequelize.authenticate()
    console.log("Подключение к базе данных установлено")

    await sequelize.sync({ force: false })
    console.log("Таблицы синхронизированы")

    return true
  } catch (error) {
    console.error("Ошибка инициализации базы данных:", error)
    throw error
  }
}

module.exports = { initializeDatabase }
