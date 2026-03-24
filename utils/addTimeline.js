const Timeline = require('../models/Timeline')

/**
 * Fire-and-forget timeline entry creator.
 * @param {object} entry
 */
const addTimeline = async ({ entityId, entityType, action, description, userId, userName, company, metadata = {} }) => {
  try {
    if (!entityId || !entityType) return
    await Timeline.create({ entityId, entityType, action, description, userId, userName, company, metadata })
  } catch (_) {
    // Non-critical
  }
}

module.exports = { addTimeline }
