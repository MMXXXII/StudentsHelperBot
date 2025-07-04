const { DataTypes } = require("sequelize")

module.exports = (sequelize) => {
  return sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      telegram_id: {
        type: DataTypes.BIGINT,
        unique: true,
        allowNull: false,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      first_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      last_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role: {
        type: DataTypes.ENUM("admin", "user"),
        defaultValue: "user",
      },
      notifications_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      settings: {
        type: DataTypes.JSON,
        defaultValue: {},
      },
    },
    {
      tableName: "users",
      timestamps: true,
    },
  )
}
