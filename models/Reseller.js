const mongoose = require('mongoose')

const resellerSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  email:          { type: String, required: true, unique: true },
  password:       { type: String, required: true },
  phone:          { type: String, default: '' },
  commissionRate: { type: Number, default: 10 },   // %
  totalSales:     { type: Number, default: 0 },
  totalRevenue:   { type: Number, default: 0 },
  isActive:       { type: Boolean, default: true },
  maxCompanies:   { type: Number, default: 10 },
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('Reseller', resellerSchema)
