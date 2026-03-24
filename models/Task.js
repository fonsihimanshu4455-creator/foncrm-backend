const mongoose = require('mongoose')

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  dueDate: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'cancelled'], default: 'pending' },
  type: {
    type: String,
    enum: ['call', 'email', 'meeting', 'follow_up', 'demo', 'task', 'other'],
    default: 'task'
  },
  company: { type: String, default: '' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  relatedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  relatedDeal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', default: null },
  relatedContact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
  reminder: { type: Date, default: null },
  tags: [{ type: String }],
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } })

// Virtual: check if overdue
taskSchema.virtual('isOverdue').get(function () {
  return !!(
    this.dueDate &&
    this.dueDate < new Date() &&
    !['completed', 'cancelled'].includes(this.status)
  )
})

module.exports = mongoose.model('Task', taskSchema)
