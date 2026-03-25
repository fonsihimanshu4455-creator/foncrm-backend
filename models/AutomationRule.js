const mongoose = require('mongoose')

const automationRuleSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  isActive:    { type: Boolean, default: true },
  trigger: {
    event: {
      type: String,
      enum: ['lead_created', 'deal_stage_changed', 'task_overdue', 'email_opened', 'no_activity_X_days'],
      required: true
    },
    conditions: [{ field: String, operator: String, value: mongoose.Schema.Types.Mixed }],
    config:     { type: mongoose.Schema.Types.Mixed, default: {} }   // e.g. { days: 7 } for no_activity
  },
  actions: [{
    type: {
      type: String,
      enum: ['send_whatsapp', 'send_email', 'create_task', 'assign_lead', 'add_tag', 'update_field', 'notify_manager']
    },
    config:       { type: mongoose.Schema.Types.Mixed, default: {} },
    delayMinutes: { type: Number, default: 0 },
    order:        { type: Number, default: 0 }
  }],
  runCount:  { type: Number, default: 0 },
  lastRunAt: { type: Date },
  company:   { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('AutomationRule', automationRuleSchema)
