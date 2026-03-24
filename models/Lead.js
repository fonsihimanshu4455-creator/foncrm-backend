const mongoose = require('mongoose')

const leadSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String },
  phone: { type: String },
  status: { type: String, default: 'New', enum: ['New', 'Hot', 'Warm', 'Cold'] },
  source: { type: String, default: 'Manual' },
  value: { type: Number, default: 0 },
  notes: { type: String },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  company: { type: String, default: '' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// Virtual: auto-calculated lead score (0–100)
leadSchema.virtual('score').get(function () {
  let s = 0
  if (this.email) s += 15
  if (this.phone) s += 15
  if (this.status === 'Hot') s += 30
  else if (this.status === 'Warm') s += 20
  else if (this.status === 'New') s += 10
  else s += 5                         // Cold
  if (this.value > 10000) s += 20
  else if (this.value > 1000) s += 10
  else if (this.value > 0) s += 5
  if (this.notes) s += 5
  if (this.assignedTo) s += 10
  return Math.min(s, 100)
})

module.exports = mongoose.model('Lead', leadSchema)
