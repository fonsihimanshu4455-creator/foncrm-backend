const express = require('express')
const router = express.Router()
const Lead = require('../models/Lead')
const Contact = require('../models/Contact')
const Deal = require('../models/Deal')
const Task = require('../models/Task')
const { protect } = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')
const { getScopeFilter } = require('../utils/scopeFilter')

/**
 * GET /api/search?q=<query>&types=leads,contacts,deals,tasks&limit=5
 *
 * Searches across leads, contacts, deals, and tasks.
 * Results are role-scoped (superadmin sees all, admin/manager sees company, agent sees own).
 * Returns categorised results with a totalResults count.
 */
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { q, types = 'leads,contacts,deals,tasks', limit = 5 } = req.query

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' })
    }

    const regex = { $regex: q.trim(), $options: 'i' }
    const scope = getScopeFilter(req.user)
    const lim = Math.min(parseInt(limit) || 5, 20)
    const searchTypes = types.split(',').map(t => t.trim())

    const searches = []

    if (searchTypes.includes('leads')) {
      searches.push(
        Lead.find({
          ...scope,
          $or: [{ name: regex }, { email: regex }, { phone: regex }]
        })
          .limit(lim)
          .select('name email phone status value source')
          .then(r => ({ type: 'leads', results: r }))
      )
    }

    if (searchTypes.includes('contacts')) {
      searches.push(
        Contact.find({
          ...scope,
          $or: [{ name: regex }, { email: regex }, { phone: regex }, { company: regex }, { jobTitle: regex }]
        })
          .limit(lim)
          .select('name email phone company jobTitle status leadScore')
          .then(r => ({ type: 'contacts', results: r }))
      )
    }

    if (searchTypes.includes('deals')) {
      searches.push(
        Deal.find({
          ...scope,
          $or: [{ title: regex }, { notes: regex }]
        })
          .limit(lim)
          .select('title value stage probability currency')
          .then(r => ({ type: 'deals', results: r }))
      )
    }

    if (searchTypes.includes('tasks')) {
      searches.push(
        Task.find({
          ...scope,
          $or: [{ title: regex }, { description: regex }]
        })
          .limit(lim)
          .select('title status priority dueDate type')
          .then(r => ({ type: 'tasks', results: r }))
      )
    }

    const settled = await Promise.all(searches)

    const response = { query: q.trim(), totalResults: 0 }
    settled.forEach(({ type, results }) => {
      response[type] = results
      response.totalResults += results.length
    })

    res.json(response)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
