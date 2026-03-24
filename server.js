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
    version: '2.0.0',
    routes: [
      'POST   /api/auth/register',
      'POST   /api/auth/login',
      'GET    /api/leads',
      'POST   /api/leads',
      'PUT    /api/leads/:id',
      'DELETE /api/leads/:id',
      'GET    /api/contacts',
      'POST   /api/contacts',
      'PUT    /api/contacts/:id',
      'DELETE /api/contacts/:id',
      'GET    /api/contacts/:id/timeline',
      'GET    /api/deals',
      'POST   /api/deals',
      'PUT    /api/deals/:id',
      'PATCH  /api/deals/:id/stage',
      'GET    /api/deals/pipeline',
      'DELETE /api/deals/:id',
      'GET    /api/tasks',
      'POST   /api/tasks',
      'PUT    /api/tasks/:id',
      'PATCH  /api/tasks/:id/complete',
      'DELETE /api/tasks/:id',
      'GET    /api/notifications',
      'PUT    /api/notifications/read-all',
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
