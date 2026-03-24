const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  type: {
    type: String,
    enum: ['lead', 'deal', 'task', 'contact', 'system', 'reminder', 'alert'],
    default: 'system'
  },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  relatedModel: { type: String, default: '' },
  relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
  company: { type: String, default: '' },
  actionUrl: { type: String, default: '' },
}, { timestamps: true })

// Index for fast per-user queries
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 })

module.exports = mongoose.model('Notification', notificationSchema)
