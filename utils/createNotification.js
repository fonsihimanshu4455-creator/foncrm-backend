const Notification = require('../models/Notification')

/**
 * Fire-and-forget notification helper.
 * Never throws — notification failures should never break the main request flow.
 */
const notify = async ({
  userId,
  title,
  message = '',
  type = 'system',
  priority = 'medium',
  relatedModel = '',
  relatedId = null,
  company = '',
  actionUrl = ''
}) => {
  try {
    if (!userId) return
    await Notification.create({
      user: userId,
      title,
      message,
      type,
      priority,
      relatedModel,
      relatedId,
      company,
      actionUrl
    })
  } catch (_) {
    // silent — notifications are non-critical
  }
}

module.exports = { notify }
