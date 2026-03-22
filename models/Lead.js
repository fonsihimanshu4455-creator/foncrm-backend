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
}, { timestamps: true })

module.exports = mongoose.model('Lead', leadSchema)