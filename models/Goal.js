const mongoose = require('mongoose')

const goalSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  type:        { type: String, enum: ['leads', 'deals', 'revenue', 'tasks', 'calls'], required: true },
  target:      { type: Number, required: true },
  current:     { type: Number, default: 0 },
  period:      { type: String, enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], default: 'monthly' },
  deadline:    { type: Date },
  status:      { type: String, enum: ['active', 'completed', 'failed', 'paused'], default: 'active' },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },    // individual goal
  teamId:      { type: String, default: '' },                              // team goal
  assignedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  company:     { type: String, default: '' },
  progressHistory: [{
    value:    Number,
    date:     { type: Date, default: Date.now },
    note:     String
  }]
}, { timestamps: true })

module.exports = mongoose.model('Goal', goalSchema)
