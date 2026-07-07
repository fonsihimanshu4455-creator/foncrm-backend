const mongoose = require('mongoose')

/**
 * Simple to-do task per the frontend contract:
 *   { text, done:Boolean, user, company }
 * Legacy optional fields are kept (not required) so existing analytics
 * routes that reference them keep working without errors.
 */
const taskSchema = new mongoose.Schema({
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  company: { type: String, default: '' },

  // ── Legacy / optional CRM fields (kept for analytics compatibility) ──
  completedAt: { type: Date, default: null },
  dueDate: { type: Date, default: null },
  status: { type: String, default: 'pending' },
  relatedDeal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', default: null },
  relatedContact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true })

module.exports = mongoose.model('Task', taskSchema)
