const { DataTypes } = require("sequelize")

module.exports = (sequelize) => {
  return sequelize.define(
    "UserTask",
    {
      user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      task_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      completed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "user_tasks",
      timestamps: true,
    },
  )
}
