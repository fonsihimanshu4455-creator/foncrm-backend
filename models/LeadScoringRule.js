const mongoose = require('mongoose')

const leadScoringRuleSchema = new mongoose.Schema({
  name:     String,
  company:  String,
  isActive: { type: Boolean, default: true },
  rules: [{
    field:    String,                          // 'source', 'status', 'hasEmail', 'hasPhone', 'hasValue'
    operator: String,                          // 'equals', 'contains', 'exists', 'gte'
    value:    mongoose.Schema.Types.Mixed,     // comparison value
    score:    { type: Number, default: 0 }     // points added when rule matches
  }],
  maxScore:  { type: Number, default: 100 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('LeadScoringRule', leadScoringRuleSchema)
