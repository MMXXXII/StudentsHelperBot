const { DataTypes } = require("sequelize")

module.exports = (sequelize) => {
  return sequelize.define(
    "SubjectRequest",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      subject_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      group_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        defaultValue: "pending",
      },
    },
    {
      tableName: "subject_requests",
      timestamps: true,
    },
  )
}
