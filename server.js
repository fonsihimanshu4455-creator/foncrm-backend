const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const mongoose = require('mongoose')

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

app.use('/api/auth', require('./routes/auth'))
app.use('/api/leads', require('./routes/leads'))
app.use('/api/superadmin', require('./routes/superadmin'))
app.use('/api/admin', require('./routes/admin'))

app.get('/', (req, res) => {
  res.json({ message: 'FonCRM Backend Running! 🚀' })
})

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected!')
    app.listen(process.env.PORT || 5000, () => {
      console.log(`🚀 Server running on port ${process.env.PORT || 5000}`)
    })
  })
  .catch(err => console.log('❌ DB Error:', err))
