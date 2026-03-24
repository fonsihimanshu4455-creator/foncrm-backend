const mongoose = require('mongoose')

const dealTemplateSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  description:  { type: String, default: '' },
  defaultValue: { type: Number, default: 0 },
  estimatedDays:{ type: Number, default: 30 },
  stages: [{
    name:        String,
    durationDays:{ type: Number, default: 7 },
    description: String
  }],
  defaultStage: { type: String, default: 'new' },
  tags:         [{ type: String }],
  products: [{
    name:     String,
    price:    Number,
    quantity: { type: Number, default: 1 }
  }],
  company:   { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive:  { type: Boolean, default: true }
}, { timestamps: true })

module.exports = mongoose.model('DealTemplate', dealTemplateSchema)
