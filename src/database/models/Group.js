const { DataTypes } = require("sequelize")

module.exports = (sequelize) => {
  return sequelize.define(
    "Group",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("active", "pending", "rejected"),
        defaultValue: "active",
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      tableName: "groups",
      timestamps: true,
    },
  )
}
