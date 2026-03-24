const UserPoints = require('../models/UserPoints')
const Lead       = require('../models/Lead')
const Deal       = require('../models/Deal')

const POINT_VALUES = {
  lead_created:   10,
  deal_won:       100,
  task_completed: 5,
  lead_converted: 50
}

const ALL_BADGES = [
  { id: 'Deal Closer',     desc: 'Won your first deal' },
  { id: 'Sales Champion',  desc: 'Won 5 deals total' },
  { id: 'Lead Machine',    desc: 'Added 10 leads in a single day' },
  { id: 'Converter',       desc: 'Converted a lead to a deal' },
  { id: 'Task Master',     desc: 'Completed 20 tasks' }
]

/**
 * Award points to a user for a CRM action.
 * @param {string|ObjectId} userId
 * @param {string} company
 * @param {string} action  - 'lead_created' | 'deal_won' | 'task_completed' | 'lead_converted'
 * @param {object} [ctx]   - extra context (for badge checks)
 */
const addPoints = async (userId, company, action, ctx = {}) => {
  try {
    if (!userId) return
    const pts = POINT_VALUES[action] || 0

    let doc = await UserPoints.findOneAndUpdate(
      { userId },
      {
        $inc: {
          points:        pts,
          weeklyPoints:  pts,
          monthlyPoints: pts
        },
        $setOnInsert: { userId, company, rank: 0, badges: [] },
        $push: { activityLog: { action, points: pts, timestamp: new Date() } }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    const newBadges = []

    if (action === 'deal_won') {
      // "Deal Closer" — first win ever
      if (!doc.badges.includes('Deal Closer')) newBadges.push('Deal Closer')

      // "Sales Champion" — 5+ wins
      if (!doc.badges.includes('Sales Champion')) {
        const winCount = await Deal.countDocuments({ assignedTo: userId, stage: 'won' })
        if (winCount >= 5) newBadges.push('Sales Champion')
      }
    }

    if (action === 'lead_created') {
      // "Lead Machine" — 10 leads in one calendar day
      if (!doc.badges.includes('Lead Machine')) {
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
        const endOfDay   = new Date(); endOfDay.setHours(23, 59, 59, 999)
        const todayCount = await Lead.countDocuments({
          createdBy:  userId,
          createdAt:  { $gte: startOfDay, $lte: endOfDay }
        })
        if (todayCount >= 10) newBadges.push('Lead Machine')
      }
    }

    if (action === 'lead_converted' && !doc.badges.includes('Converter')) {
      newBadges.push('Converter')
    }

    if (action === 'task_completed') {
      // "Task Master" — 20 completed tasks (approximate via points history)
      if (!doc.badges.includes('Task Master')) {
        const completions = (doc.activityLog || []).filter(l => l.action === 'task_completed').length
        if (completions >= 20) newBadges.push('Task Master')
      }
    }

    if (newBadges.length > 0) {
      await UserPoints.findOneAndUpdate(
        { userId },
        { $addToSet: { badges: { $each: newBadges } } }
      )
    }
  } catch (_) {
    // Non-critical — never crash main request
  }
}

module.exports = { addPoints, ALL_BADGES }
