const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const mongoose = require('mongoose')

dotenv.config()

const { seedSuperadmin } = require('./utils/seedSuperadmin')

const app = express()

// ─── CORS ──────────────────────────────────────────────────────────────────────
// Allow the local dev frontend, any *.vercel.app deployment, and explicit
// origins listed in FRONTEND_URL (comma-separated). Requests with no Origin
// header (curl, server-to-server, mobile) are always allowed.
const staticOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(s => s.trim()) : [])
].filter(Boolean)

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    if (staticOrigins.includes(origin)) return callback(null, true)
    if (/\.vercel\.app$/.test(new URL(origin).hostname)) return callback(null, true)
    return callback(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true
}

app.use(cors(corsOptions))
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
app.use('/api/reports',       require('./routes/reports'))
app.use('/api/search',        require('./routes/search'))
app.use('/api/whatsapp',      require('./routes/whatsapp'))
app.use('/api/settings',      require('./routes/settings'))

// ─── Admin routes ─────────────────────────────────────────────────────────────
app.use('/api/admin',         require('./routes/admin'))
app.use('/api/superadmin',    require('./routes/superadmin'))

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'FonCRM Backend Running! 🚀', version: '2.1.0' })
})

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` })
})

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message)
  res.status(500).json({ message: err.message || 'Internal server error' })
})

// ─── DB + Server start ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB Connected!')
    try { await seedSuperadmin() } catch (e) { console.log('⚠️  Seed error:', e.message) }
    app.listen(process.env.PORT || 5000, () => {
      console.log(`🚀 FonCRM running on port ${process.env.PORT || 5000}`)
    })
  })
  .catch(err => console.log('❌ DB Error:', err))

module.exports = app
