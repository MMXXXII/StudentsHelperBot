const { DataTypes } = require("sequelize")

module.exports = (sequelize) => {
  return sequelize.define(
    "Task",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      subject_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      group_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      deadline: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      for_group: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      status: {
        type: DataTypes.ENUM("active", "pending", "approved"),
        defaultValue: "active",
      },
    },
    {
      tableName: "tasks",
      timestamps: true,
    },
  )
}
