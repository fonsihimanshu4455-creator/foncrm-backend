const mongoose = require('mongoose')

const workflowSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: String,
  isActive:    { type: Boolean, default: true },
  trigger: {
    type: {
      type: String,
      enum: ['lead_status_change', 'lead_created', 'deal_stage_change', 'task_overdue', 'time_delay', 'form_submit'],
      required: true
    },
    conditions: mongoose.Schema.Types.Mixed   // e.g. { status: 'Hot', fromStatus: 'New' }
  },
  actions: [{
    type: {
      type: String,
      enum: ['send_email', 'create_task', 'assign_lead', 'update_field', 'send_notification', 'add_tag']
    },
    config:       mongoose.Schema.Types.Mixed, // action-specific config object
    delayMinutes: { type: Number, default: 0 },
    order:        Number
  }],
  company:    String,
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  runCount:   { type: Number, default: 0 },
  lastRunAt:  Date
}, { timestamps: true })

module.exports = mongoose.model('Workflow', workflowSchema)
