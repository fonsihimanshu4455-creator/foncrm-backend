const mongoose = require('mongoose')

const activityLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String },
  userRole: { type: String },
  action: { type: String, required: true },
  details: { type: String, default: '' },
  company: { type: String, default: '' },
  ip: { type: String, default: '' },
}, { timestamps: true })

module.exports = mongoose.model('ActivityLog', activityLogSchema)
