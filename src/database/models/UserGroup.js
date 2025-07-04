const { DataTypes } = require("sequelize")

module.exports = (sequelize) => {
  return sequelize.define(
    "UserGroup",
    {
      user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      group_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      role: {
        type: DataTypes.ENUM("member", "curator"),
        defaultValue: "member",
      },
      joined_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "user_groups",
      timestamps: false,
    },
  )
}
