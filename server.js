const express    = require('express')
const cors       = require('cors')
const dotenv     = require('dotenv')
const mongoose   = require('mongoose')

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

// ─── Core routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'))
app.use('/api/leads',         require('./routes/leads'))
app.use('/api/contacts',      require('./routes/contacts'))
app.use('/api/deals',         require('./routes/deals'))
app.use('/api/tasks',         require('./routes/tasks'))
app.use('/api/notifications', require('./routes/notifications'))

// ─── Phase 1 feature routes ───────────────────────────────────────────────────
app.use('/api/emails',         require('./routes/emails'))
app.use('/api/workflows',      require('./routes/workflows'))
app.use('/api/lead-scoring',   require('./routes/leadScoring'))
app.use('/api/sales-forecast', require('./routes/salesForecast'))
app.use('/api/webforms',       require('./routes/webforms'))
app.use('/api/meetings',       require('./routes/meetings'))
app.use('/api/documents',      require('./routes/documents'))

// ─── Phase 2 feature routes ───────────────────────────────────────────────────
app.use('/api/ai',             require('./routes/ai'))
app.use('/api/inbox',          require('./routes/inbox'))
app.use('/api/gamification',   require('./routes/gamification'))
app.use('/api/voice-notes',    require('./routes/voiceNotes'))
app.use('/api/timeline',       require('./routes/timeline'))
app.use('/api/tags',           require('./routes/tags'))
app.use('/api/deal-templates', require('./routes/dealTemplates'))
app.use('/api/reports',        require('./routes/reports'))
app.use('/api/portal',         require('./routes/portal'))

// ─── Analytics & utility routes ───────────────────────────────────────────────
app.use('/api/dashboard',      require('./routes/dashboard'))
app.use('/api/search',         require('./routes/search'))

// ─── Admin routes ─────────────────────────────────────────────────────────────
app.use('/api/admin',          require('./routes/admin'))
app.use('/api/superadmin',     require('./routes/superadmin'))

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'FonCRM Backend Running!',
    version: '4.0.0',
    phase1: [
      'GET/POST/PUT/DELETE /api/emails',
      'GET                 /api/emails/track/:token',
      'GET                 /api/emails/stats/overview',
      'GET/POST/PUT/DELETE /api/workflows',
      'PATCH               /api/workflows/:id/toggle',
      'POST                /api/workflows/:id/run',
      'GET                 /api/workflows/:id/logs',
      'GET/POST/PUT/DELETE /api/lead-scoring/rules',
      'GET                 /api/lead-scoring/score/:leadId',
      'GET                 /api/lead-scoring/ranked',
      'GET/POST/PUT/DELETE /api/sales-forecast',
      'GET                 /api/sales-forecast/pipeline/:year/:month',
      'GET                 /api/sales-forecast/annual/:year',
      'GET/POST/PUT/DELETE /api/webforms',
      'GET                 /api/webforms/:id/embed',
      'POST                /api/webforms/submit/:token',
      'GET/POST/PUT/DELETE /api/meetings',
      'GET                 /api/meetings/upcoming',
      'PATCH               /api/meetings/:id/status',
      'PUT                 /api/meetings/:id/outcome',
      'PATCH               /api/meetings/:id/attendees',
      'GET                 /api/meetings/reminders/due',
      'GET/POST/PUT/DELETE /api/documents',
      'PATCH               /api/documents/:id/download',
      'GET                 /api/documents/lead/:leadId',
      'GET                 /api/documents/deal/:dealId',
      'GET                 /api/documents/contact/:contactId',
    ],
    phase2: [
      'GET  /api/ai/suggestions',
      'GET  /api/ai/suggest-action/:leadId',
      'GET  /api/ai/draft-message/:leadId',
      'GET  /api/ai/predict-deal/:dealId',
      'GET  /api/ai/summarize-lead/:leadId',
      'GET  /api/ai/email-reply/:emailId',
      'GET/POST/PUT/DELETE /api/inbox',
      'GET  /api/inbox/stats',
      'PUT  /api/inbox/:id/read',
      'PUT  /api/inbox/read-all',
      'GET  /api/gamification/leaderboard',
      'GET  /api/gamification/my-stats',
      'GET  /api/gamification/badges',
      'POST /api/gamification/add-points',
      'POST /api/voice-notes',
      'GET  /api/voice-notes/:entityType/:entityId',
      'DELETE /api/voice-notes/:id',
      'GET  /api/timeline/:entityType/:entityId',
      'POST /api/timeline',
      'GET  /api/tags',
      'GET  /api/tags/leads/:tag',
      'GET  /api/tags/contacts/:tag',
      'GET  /api/tags/deals/:tag',
      'GET/POST/PUT/DELETE /api/deal-templates',
      'POST /api/deal-templates/deals/:id/clone',
      'POST /api/deal-templates/leads/:id/convert-to-deal',
      'GET  /api/reports/sales-performance',
      'GET  /api/reports/pipeline-analysis',
      'GET  /api/reports/lead-sources',
      'GET  /api/reports/activity-report',
      'GET  /api/reports/revenue-forecast',
      'GET  /api/portal/:token/deals',
      'GET  /api/portal/:token/timeline',
      'GET  /api/portal/:token/documents',
      'POST /api/superadmin/companies/:id/portal-token',
      'POST /api/leads/bulk-update',
      'POST /api/leads/bulk-delete',
      'POST /api/leads/import',
      'GET  /api/leads/export',
      'GET  /api/leads/by-tag/:tag',
      'POST /api/contacts/bulk-update',
      'POST /api/contacts/import',
      'GET  /api/contacts/export',
      'GET  /api/contacts/by-tag/:tag',
    ]
  })
})

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` })
})

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ message: err.message || 'Internal server error' })
})

// ─── Background job: smart notifications (every 1 hour) ──────────────────────
function startBackgroundJobs() {
  const Notification = require('./models/Notification')
  const Lead         = require('./models/Lead')
  const Deal         = require('./models/Deal')
  const Task         = require('./models/Task')
  const User         = require('./models/User')

  const runSmartNotifications = async () => {
    try {
      const now         = new Date()
      const threeDaysAgo = new Date(now - 3 * 86400000)
      const sevenDaysAgo = new Date(now - 7 * 86400000)

      // a. Deals with no activity for 3+ days (updatedAt < 3 days ago, not closed)
      const staleDeals = await Deal.find({
        stage:     { $nin: ['won', 'lost'] },
        updatedAt: { $lt: threeDaysAgo }
      }).populate('assignedTo', '_id company').limit(100)

      for (const deal of staleDeals) {
        if (!deal.assignedTo) continue
        const exists = await Notification.findOne({
          user:    deal.assignedTo._id,
          title:   'Deal Going Stale',
          relatedId: deal._id,
          createdAt: { $gt: threeDaysAgo }
        })
        if (!exists) {
          await Notification.create({
            user:    deal.assignedTo._id,
            title:   'Deal Going Stale',
            message: `Deal "${deal.title}" has had no activity for 3+ days`,
            type:    'alert',
            priority:'high',
            relatedModel: 'Deal',
            relatedId:    deal._id,
            company:      deal.company
          })
        }
      }

      // b. Overdue tasks
      const overdueTasks = await Task.find({
        dueDate: { $lt: now },
        status:  { $nin: ['completed', 'cancelled'] }
      }).populate('assignedTo', '_id').limit(200)

      for (const task of overdueTasks) {
        if (!task.assignedTo) continue
        const exists = await Notification.findOne({
          user:    task.assignedTo._id,
          title:   'Task Overdue',
          relatedId: task._id,
          createdAt: { $gt: new Date(now - 86400000) }
        })
        if (!exists) {
          await Notification.create({
            user:    task.assignedTo._id,
            title:   'Task Overdue',
            message: `Task "${task.title}" is overdue`,
            type:    'task',
            priority:'high',
            relatedModel: 'Task',
            relatedId:    task._id,
            company:      task.company
          })
        }
      }

      // c. Leads with no contact for 7+ days
      const coldLeads = await Lead.find({
        status:    { $ne: 'Cold' },
        updatedAt: { $lt: sevenDaysAgo }
      }).populate('assignedTo', '_id').limit(100)

      for (const lead of coldLeads) {
        if (!lead.assignedTo) continue
        const exists = await Notification.findOne({
          user:    lead.assignedTo._id,
          title:   'Lead Needs Follow-up',
          relatedId: lead._id,
          createdAt: { $gt: sevenDaysAgo }
        })
        if (!exists) {
          await Notification.create({
            user:    lead.assignedTo._id,
            title:   'Lead Needs Follow-up',
            message: `Lead "${lead.name}" hasn't been contacted in 7+ days`,
            type:    'lead',
            priority:'medium',
            relatedModel: 'Lead',
            relatedId:    lead._id,
            company:      lead.company
          })
        }
      }

      console.log(`[BG] Smart notifications ran at ${new Date().toISOString()}`)
    } catch (err) {
      console.error('[BG] Smart notification error:', err.message)
    }
  }

  // Run immediately then every hour
  runSmartNotifications()
  setInterval(runSmartNotifications, 60 * 60 * 1000)
}

// ─── DB + Server start ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected!')
    app.listen(process.env.PORT || 5000, () => {
      console.log(`🚀 FonCRM running on port ${process.env.PORT || 5000}`)
      startBackgroundJobs()
    })
  })
  .catch(err => console.log('❌ DB Error:', err))
