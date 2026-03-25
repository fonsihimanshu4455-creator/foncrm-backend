const express    = require('express')
const cors       = require('cors')
const dotenv     = require('dotenv')
const mongoose   = require('mongoose')
const rateLimit  = require('express-rate-limit')

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

// ─── Request Logger ───────────────────────────────────────────────────────────
app.use(require('./middleware/requestLogger'))

// ─── Rate Limiting (100 req / 15 min per IP) ─────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many requests, please try again later.' }
})
app.use('/api/', limiter)

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

// ─── Phase 3 feature routes ───────────────────────────────────────────────────
app.use('/api/reseller',       require('./routes/reseller'))
app.use('/api/invoices',       require('./routes/invoices'))
app.use('/api/whatsapp',       require('./routes/whatsapp'))
app.use('/api/subscriptions',  require('./routes/subscriptions'))
app.use('/api/payments',       require('./routes/payments'))
app.use('/api/analytics',      require('./routes/analytics'))
app.use('/api/integrations',   require('./routes/integrations'))
app.use('/api/security',       require('./routes/security'))
app.use('/api/automation',     require('./routes/automation'))
app.use('/api/i18n',           require('./routes/i18n'))
app.use('/api/data-health',    require('./routes/dataHealth'))
app.use('/api/goals',          require('./routes/goals'))
app.use('/api/public/v1',      require('./routes/publicApi'))

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
    version: '5.0.0',
    endpoints: {
      auth:          '/api/auth',
      leads:         '/api/leads',
      contacts:      '/api/contacts',
      deals:         '/api/deals',
      tasks:         '/api/tasks',
      emails:        '/api/emails',
      workflows:     '/api/workflows',
      leadScoring:   '/api/lead-scoring',
      salesForecast: '/api/sales-forecast',
      webforms:      '/api/webforms',
      meetings:      '/api/meetings',
      documents:     '/api/documents',
      ai:            '/api/ai',
      inbox:         '/api/inbox',
      gamification:  '/api/gamification',
      voiceNotes:    '/api/voice-notes',
      timeline:      '/api/timeline',
      tags:          '/api/tags',
      dealTemplates: '/api/deal-templates',
      reports:       '/api/reports',
      portal:        '/api/portal',
      reseller:      '/api/reseller',
      invoices:      '/api/invoices',
      whatsapp:      '/api/whatsapp',
      subscriptions: '/api/subscriptions',
      payments:      '/api/payments',
      analytics:     '/api/analytics',
      integrations:  '/api/integrations',
      security:      '/api/security',
      automation:    '/api/automation',
      i18n:          '/api/i18n',
      dataHealth:    '/api/data-health',
      goals:         '/api/goals',
      publicApi:     '/api/public/v1',
      dashboard:     '/api/dashboard',
      search:        '/api/search',
      admin:         '/api/admin',
      superadmin:    '/api/superadmin'
    }
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
function startSmartNotifications() {
  const Notification = require('./models/Notification')
  const Lead         = require('./models/Lead')
  const Deal         = require('./models/Deal')
  const Task         = require('./models/Task')

  const run = async () => {
    try {
      const now          = new Date()
      const threeDaysAgo = new Date(now - 3 * 86400000)
      const sevenDaysAgo = new Date(now - 7 * 86400000)

      // Deals with no activity for 3+ days
      const staleDeals = await Deal.find({
        stage:     { $nin: ['won', 'lost'] },
        updatedAt: { $lt: threeDaysAgo }
      }).populate('assignedTo', '_id company').limit(100)

      for (const deal of staleDeals) {
        if (!deal.assignedTo) continue
        const exists = await Notification.findOne({
          user:      deal.assignedTo._id,
          title:     'Deal Going Stale',
          relatedId: deal._id,
          createdAt: { $gt: threeDaysAgo }
        })
        if (!exists) {
          await Notification.create({
            user:         deal.assignedTo._id,
            title:        'Deal Going Stale',
            message:      `Deal "${deal.title}" has had no activity for 3+ days`,
            type:         'alert',
            priority:     'high',
            relatedModel: 'Deal',
            relatedId:    deal._id,
            company:      deal.company
          })
        }
      }

      // Overdue tasks
      const overdueTasks = await Task.find({
        dueDate: { $lt: now },
        status:  { $nin: ['completed', 'cancelled'] }
      }).populate('assignedTo', '_id').limit(200)

      for (const task of overdueTasks) {
        if (!task.assignedTo) continue
        const exists = await Notification.findOne({
          user:      task.assignedTo._id,
          title:     'Task Overdue',
          relatedId: task._id,
          createdAt: { $gt: new Date(now - 86400000) }
        })
        if (!exists) {
          await Notification.create({
            user:         task.assignedTo._id,
            title:        'Task Overdue',
            message:      `Task "${task.title}" is overdue`,
            type:         'task',
            priority:     'high',
            relatedModel: 'Task',
            relatedId:    task._id,
            company:      task.company
          })
        }
      }

      // Leads with no contact for 7+ days
      const coldLeads = await Lead.find({
        status:    { $ne: 'Cold' },
        updatedAt: { $lt: sevenDaysAgo }
      }).populate('assignedTo', '_id').limit(100)

      for (const lead of coldLeads) {
        if (!lead.assignedTo) continue
        const exists = await Notification.findOne({
          user:      lead.assignedTo._id,
          title:     'Lead Needs Follow-up',
          relatedId: lead._id,
          createdAt: { $gt: sevenDaysAgo }
        })
        if (!exists) {
          await Notification.create({
            user:         lead.assignedTo._id,
            title:        'Lead Needs Follow-up',
            message:      `Lead "${lead.name}" hasn't been contacted in 7+ days`,
            type:         'lead',
            priority:     'medium',
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

  run()
  setInterval(run, 60 * 60 * 1000) // every 1 hour
}

// ─── Background job: automation engine (every 30 min) ────────────────────────
function startAutomationEngine() {
  const AutomationRule = require('./models/AutomationRule')
  const AutomationLog  = require('./models/AutomationLog')
  const Lead           = require('./models/Lead')
  const Deal           = require('./models/Deal')
  const Task           = require('./models/Task')
  const Notification   = require('./models/Notification')

  const run = async () => {
    try {
      const rules = await AutomationRule.find({ isActive: true })

      for (const rule of rules) {
        try {
          const { event, conditions } = rule.trigger
          let entities = []

          // Find matching entities based on trigger event
          if (event === 'lead_created') {
            const since = new Date(Date.now() - 30 * 60 * 1000) // last 30 min
            entities = await Lead.find({ company: rule.company, createdAt: { $gte: since } }).limit(50)
          } else if (event === 'deal_stale') {
            const staleDate = new Date(Date.now() - (rule.trigger.config?.days || 3) * 86400000)
            entities = await Deal.find({ company: rule.company, stage: { $nin: ['won', 'lost'] }, updatedAt: { $lt: staleDate } }).limit(20)
          } else if (event === 'lead_status_changed') {
            const since = new Date(Date.now() - 30 * 60 * 1000)
            entities = await Lead.find({ company: rule.company, updatedAt: { $gte: since } }).limit(50)
          }

          if (entities.length === 0) continue

          const actionsRun = []
          for (const entity of entities.slice(0, 5)) { // max 5 per run
            for (const action of rule.actions.sort((a, b) => a.order - b.order)) {
              try {
                if (action.type === 'create_task') {
                  await Task.create({
                    title:     action.config?.title || `Auto: ${rule.name}`,
                    company:   rule.company,
                    relatedLead: entity.constructor.modelName === 'Lead' ? entity._id : undefined,
                    relatedDeal: entity.constructor.modelName === 'Deal' ? entity._id : undefined,
                    dueDate:   new Date(Date.now() + (action.delayMinutes || 0) * 60000 + 86400000)
                  })
                  actionsRun.push({ type: 'create_task', status: 'success' })
                } else if (action.type === 'send_notification') {
                  if (entity.assignedTo) {
                    await Notification.create({
                      user:    entity.assignedTo,
                      title:   action.config?.title || rule.name,
                      message: action.config?.message || `Automation: ${rule.name} triggered`,
                      type:    'info',
                      company: rule.company
                    })
                    actionsRun.push({ type: 'send_notification', status: 'success' })
                  }
                }
              } catch (actionErr) {
                actionsRun.push({ type: action.type, status: 'error', error: actionErr.message })
              }
            }
          }

          if (actionsRun.length > 0) {
            await AutomationLog.create({
              ruleId:       rule._id,
              triggerEvent: event,
              status:       'success',
              actionsRun,
              entityType:   event.split('_')[0],
              company:      rule.company
            })
            await AutomationRule.findByIdAndUpdate(rule._id, { $inc: { runCount: 1 } })
          }
        } catch (ruleErr) {
          console.error(`[Automation] Rule ${rule._id} error:`, ruleErr.message)
        }
      }

      console.log(`[BG] Automation engine ran at ${new Date().toISOString()} — ${rules.length} rules checked`)
    } catch (err) {
      console.error('[BG] Automation engine error:', err.message)
    }
  }

  run()
  setInterval(run, 30 * 60 * 1000) // every 30 minutes
}

// ─── Festival reminder tasks (Indian holidays) ────────────────────────────────
function scheduleFestivalReminders() {
  const Task    = require('./models/Task')
  const Company = require('./models/Company')

  const FESTIVALS = [
    { name: 'Diwali Customer Greetings',    month: 10, day: 1  }, // approx Oct
    { name: 'Holi Festival Follow-ups',     month: 2,  day: 25 }, // approx Mar
    { name: 'New Year Sales Push',          month: 0,  day: 1  }, // Jan 1
    { name: 'Independence Day Campaign',    month: 7,  day: 14 }, // Aug 15
    { name: 'Dussehra Outreach',            month: 9,  day: 1  }, // approx Oct
  ]

  const createReminders = async () => {
    try {
      const now      = new Date()
      const month    = now.getMonth()
      const day      = now.getDate()
      const companies = await Company.find({ planStatus: 'active' }).select('name')

      for (const festival of FESTIVALS) {
        // Create reminder 7 days before festival
        const reminderDate = new Date(now.getFullYear(), festival.month, festival.day - 7)
        if (Math.abs(now - reminderDate) < 86400000) { // within 1 day of reminder date
          for (const company of companies.slice(0, 10)) {
            const exists = await Task.findOne({
              company: company.name,
              title:   festival.name,
              createdAt: { $gte: new Date(now.getFullYear(), 0, 1) }
            })
            if (!exists) {
              await Task.create({
                title:       festival.name,
                description: `Festival season reminder: Prepare special offers and greetings for ${festival.name}`,
                dueDate:     new Date(now.getFullYear(), festival.month, festival.day),
                status:      'pending',
                company:     company.name,
                priority:    'medium'
              })
            }
          }
        }
      }
    } catch (err) {
      console.error('[Festival] Reminder error:', err.message)
    }
  }

  createReminders()
  setInterval(createReminders, 24 * 60 * 60 * 1000) // daily check
}

// ─── DB + Server start ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected!')
    app.listen(process.env.PORT || 5000, () => {
      console.log(`🚀 FonCRM v5.0.0 running on port ${process.env.PORT || 5000}`)
      startSmartNotifications()
      startAutomationEngine()
      scheduleFestivalReminders()
    })
  })
  .catch(err => console.log('❌ DB Error:', err))
