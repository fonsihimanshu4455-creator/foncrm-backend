// Standalone superadmin seeder: `npm run seed`
// Reads SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD (and optional SUPERADMIN_NAME).
const dotenv = require('dotenv')
const mongoose = require('mongoose')
dotenv.config()

const { seedSuperadmin } = require('../utils/seedSuperadmin')

;(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅ MongoDB Connected!')
    await seedSuperadmin()
  } catch (err) {
    console.error('❌ Seed failed:', err.message)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
})()
