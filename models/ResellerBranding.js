const mongoose = require('mongoose')

const resellerBrandingSchema = new mongoose.Schema({
  resellerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Reseller', required: true, unique: true },
  logoUrl:       { type: String, default: '' },
  primaryColor:  { type: String, default: '#6366f1' },
  appName:       { type: String, default: 'FonCRM' },
  customDomain:  { type: String, default: '' },
  supportEmail:  { type: String, default: '' },
  faviconUrl:    { type: String, default: '' },
  tagline:       { type: String, default: '' }
}, { timestamps: true })

module.exports = mongoose.model('ResellerBranding', resellerBrandingSchema)
