const bcrypt = require('bcryptjs')
const User = require('../models/User')

/**
 * Ensures at least one superadmin exists so the system is never locked out.
 * Credentials come from env:
 *   SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_NAME (optional)
 * Runs on startup — safe to call every boot (idempotent).
 */
const seedSuperadmin = async () => {
  const email = process.env.SUPERADMIN_EMAIL
  const password = process.env.SUPERADMIN_PASSWORD
  if (!email || !password) {
    console.log('ℹ️  SUPERADMIN_EMAIL/PASSWORD not set — skipping superadmin seed')
    return
  }

  const existing = await User.findOne({ email })
  if (existing) {
    // Make sure the account is a usable superadmin.
    let changed = false
    if (existing.role !== 'superadmin') { existing.role = 'superadmin'; changed = true }
    if (!existing.isActive) { existing.isActive = true; changed = true }
    if (changed) await existing.save()
    console.log(`✅ Superadmin present: ${email}`)
    return
  }

  const hashed = await bcrypt.hash(password, 10)
  await User.create({
    name: process.env.SUPERADMIN_NAME || 'Super Admin',
    email,
    password: hashed,
    role: 'superadmin',
    company: '',
    isActive: true
  })
  console.log(`✅ Superadmin created: ${email}`)
}

module.exports = { seedSuperadmin }
