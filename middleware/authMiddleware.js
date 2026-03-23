const jwt = require('jsonwebtoken')
const ActivityLog = require('../models/ActivityLog')

const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'No token, unauthorized' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ message: 'Invalid token' })
  }
}

const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' })
    }
    next()
  }
}

const logActivity = (action) => {
  return async (req, res, next) => {
    try {
      await ActivityLog.create({
        user: req.user?.id,
        userName: req.user?.name,
        userRole: req.user?.role,
        action,
        details: JSON.stringify(req.body || {}),
        company: req.user?.company || '',
        ip: req.ip || ''
      })
    } catch (e) {}
    next()
  }
}

module.exports = { protect, allowRoles, logActivity }
