// Временное хранилище состояний пользователей
const userStates = new Map()

function setUserState(telegramId, state) {
  userStates.set(telegramId, state)
}

function getUserState(telegramId) {
  return userStates.get(telegramId)
}

function clearUserState(telegramId) {
  userStates.delete(telegramId)
}

function hasUserState(telegramId) {
  return userStates.has(telegramId)
}

module.exports = {
  setUserState,
  getUserState,
  clearUserState,
  hasUserState,
}
