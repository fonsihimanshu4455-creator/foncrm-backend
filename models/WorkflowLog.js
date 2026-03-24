const mongoose = require('mongoose')

const workflowLogSchema = new mongoose.Schema({
  workflow:    { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
  triggerType: String,
  triggerData: mongoose.Schema.Types.Mixed,
  status:      { type: String, enum: ['success', 'failed', 'partial'], default: 'success' },
  actionsExecuted: [{
    action: String,
    status: String,
    error:  String
  }],
  relatedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  relatedDeal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
  company:     String,
  error:       String
}, { timestamps: true })

module.exports = mongoose.model('WorkflowLog', workflowLogSchema)
