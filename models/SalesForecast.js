const mongoose = require('mongoose')

const salesForecastSchema = new mongoose.Schema({
  month:    { type: Number, required: true, min: 1, max: 12 },
  year:     { type: Number, required: true },
  target:   { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  company:  { type: String, required: true },
  notes:    String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

salesForecastSchema.index({ month: 1, year: 1, company: 1 }, { unique: true })

module.exports = mongoose.model('SalesForecast', salesForecastSchema)
