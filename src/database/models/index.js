const { Sequelize } = require("sequelize")

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  dialect: "mysql",
  logging: console.log, // Включаем логирование для отладки
  timezone: "+03:00",
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
})

// Импорт моделей
const User = require("./User")(sequelize)
const Group = require("./Group")(sequelize)
const UserGroup = require("./UserGroup")(sequelize)
const Subject = require("./Subject")(sequelize)
const Task = require("./Task")(sequelize)
const UserTask = require("./UserTask")(sequelize)
const GroupRequest = require("./GroupRequest")(sequelize)
const SubjectRequest = require("./SubjectRequest")(sequelize)

// Определение ассоциаций
User.belongsToMany(Group, { through: UserGroup, foreignKey: "user_id" })
Group.belongsToMany(User, { through: UserGroup, foreignKey: "group_id" })

UserGroup.belongsTo(User, { foreignKey: "user_id" })
UserGroup.belongsTo(Group, { foreignKey: "group_id" })

Subject.belongsTo(Group, { foreignKey: "group_id" })
Subject.belongsTo(User, { as: "Creator", foreignKey: "created_by" })

Task.belongsTo(Subject, { foreignKey: "subject_id" })
Task.belongsTo(Group, { foreignKey: "group_id" })
Task.belongsTo(User, { as: "Creator", foreignKey: "created_by" })

User.belongsToMany(Task, { through: UserTask, foreignKey: "user_id" })
Task.belongsToMany(User, { through: UserTask, foreignKey: "task_id" })

UserTask.belongsTo(User, { foreignKey: "user_id" })
UserTask.belongsTo(Task, { foreignKey: "task_id" })

GroupRequest.belongsTo(User, { foreignKey: "user_id" })
SubjectRequest.belongsTo(User, { foreignKey: "user_id" })
SubjectRequest.belongsTo(Group, { foreignKey: "group_id" })

// Добавляем недостающие ассоциации
Group.belongsTo(User, { as: "Creator", foreignKey: "created_by" })

module.exports = {
  sequelize,
  User,
  Group,
  UserGroup,
  Subject,
  Task,
  UserTask,
  GroupRequest,
  SubjectRequest,
}
