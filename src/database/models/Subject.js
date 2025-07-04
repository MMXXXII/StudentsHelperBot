const { DataTypes } = require("sequelize")

module.exports = (sequelize) => {
  return sequelize.define(
    "Subject",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      group_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("active", "pending", "rejected"),
        defaultValue: "active",
      },
    },
    {
      tableName: "subjects",
      timestamps: true,
    },
  )
}
