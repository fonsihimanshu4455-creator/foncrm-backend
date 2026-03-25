const mongoose = require('mongoose')

const automationLogSchema = new mongoose.Schema({
  ruleId:      { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationRule', required: true },
  ruleName:    { type: String, default: '' },
  triggerEvent:{ type: String, default: '' },
  status:      { type: String, enum: ['success', 'failed', 'partial'], default: 'success' },
  actionsRun:  [{
    type:   String,
    status: { type: String, enum: ['success', 'skipped', 'failed'] },
    error:  String
  }],
  entityType:  { type: String, default: '' },
  entityId:    { type: mongoose.Schema.Types.ObjectId },
  error:       { type: String, default: '' },
  company:     { type: String, default: '' }
}, { timestamps: true })

module.exports = mongoose.model('AutomationLog', automationLogSchema)
