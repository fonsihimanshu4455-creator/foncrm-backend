const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const mongoose = require('mongoose')

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
app.use('/api/emails',        require('./routes/emails'))
app.use('/api/workflows',     require('./routes/workflows'))
app.use('/api/lead-scoring',  require('./routes/leadScoring'))
app.use('/api/sales-forecast',require('./routes/salesForecast'))
app.use('/api/webforms',      require('./routes/webforms'))
app.use('/api/meetings',      require('./routes/meetings'))
app.use('/api/documents',     require('./routes/documents'))

// ─── Analytics & utility routes ───────────────────────────────────────────────
app.use('/api/dashboard',     require('./routes/dashboard'))
app.use('/api/search',        require('./routes/search'))

// ─── Admin routes ─────────────────────────────────────────────────────────────
app.use('/api/admin',         require('./routes/admin'))
app.use('/api/superadmin',    require('./routes/superadmin'))

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'FonCRM Backend Running! 🚀',
    version: '3.0.0',
    routes: [
      // Auth
      'POST   /api/auth/register',
      'POST   /api/auth/login',
      // Leads
      'GET    /api/leads',
      'POST   /api/leads',
      'PUT    /api/leads/:id',
      'DELETE /api/leads/:id',
      // Contacts
      'GET    /api/contacts',
      'POST   /api/contacts',
      'PUT    /api/contacts/:id',
      'DELETE /api/contacts/:id',
      'GET    /api/contacts/:id/timeline',
      // Deals
      'GET    /api/deals',
      'POST   /api/deals',
      'PUT    /api/deals/:id',
      'PATCH  /api/deals/:id/stage',
      'GET    /api/deals/pipeline',
      'DELETE /api/deals/:id',
      // Tasks
      'GET    /api/tasks',
      'POST   /api/tasks',
      'PUT    /api/tasks/:id',
      'PATCH  /api/tasks/:id/complete',
      'DELETE /api/tasks/:id',
      // Notifications
      'GET    /api/notifications',
      'PUT    /api/notifications/read-all',
      // Emails (Phase 1)
      'GET    /api/emails',
      'POST   /api/emails',
      'PUT    /api/emails/:id',
      'DELETE /api/emails/:id',
      'GET    /api/emails/track/:token',
      'GET    /api/emails/stats/overview',
      // Workflows (Phase 1)
      'GET    /api/workflows',
      'POST   /api/workflows',
      'PUT    /api/workflows/:id',
      'PATCH  /api/workflows/:id/toggle',
      'DELETE /api/workflows/:id',
      'POST   /api/workflows/:id/run',
      'GET    /api/workflows/:id/logs',
      // Lead Scoring (Phase 1)
      'GET    /api/lead-scoring/rules',
      'POST   /api/lead-scoring/rules',
      'PUT    /api/lead-scoring/rules/:id',
      'DELETE /api/lead-scoring/rules/:id',
      'GET    /api/lead-scoring/score/:leadId',
      'GET    /api/lead-scoring/ranked',
      // Sales Forecast (Phase 1)
      'GET    /api/sales-forecast',
      'POST   /api/sales-forecast',
      'PUT    /api/sales-forecast/:id',
      'DELETE /api/sales-forecast/:id',
      'GET    /api/sales-forecast/:year/:month',
      'GET    /api/sales-forecast/pipeline/:year/:month',
      'GET    /api/sales-forecast/annual/:year',
      // Web Forms (Phase 1)
      'GET    /api/webforms',
      'POST   /api/webforms',
      'PUT    /api/webforms/:id',
      'DELETE /api/webforms/:id',
      'GET    /api/webforms/:id/embed',
      'POST   /api/webforms/submit/:token',
      // Meetings (Phase 1)
      'GET    /api/meetings',
      'GET    /api/meetings/upcoming',
      'POST   /api/meetings',
      'PUT    /api/meetings/:id',
      'PATCH  /api/meetings/:id/status',
      'PATCH  /api/meetings/:id/attendees',
      'DELETE /api/meetings/:id',
      'GET    /api/meetings/reminders/due',
      // Documents (Phase 1)
      'GET    /api/documents',
      'POST   /api/documents',
      'PUT    /api/documents/:id',
      'PATCH  /api/documents/:id/download',
      'DELETE /api/documents/:id',
      'GET    /api/documents/lead/:leadId',
      'GET    /api/documents/deal/:dealId',
      'GET    /api/documents/contact/:contactId',
      // Analytics & Admin
      'GET    /api/dashboard/stats',
      'GET    /api/dashboard/pipeline-health',
      'GET    /api/dashboard/source-analytics',
      'GET    /api/search?q=',
      'GET    /api/admin/stats',
      'GET    /api/superadmin/stats',
    ]
  })
})

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` })
})

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err)
  res.status(500).json({ message: err.message || 'Internal server error' })
})

// ─── DB + Server start ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected!')
    app.listen(process.env.PORT || 5000, () => {
      console.log(`🚀 FonCRM running on port ${process.env.PORT || 5000}`)
    })
  })
  .catch(err => console.log('❌ DB Error:', err))
