const mongoose = require('mongoose')

const userPointsSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  company:      { type: String, default: '' },
  points:       { type: Number, default: 0 },
  weeklyPoints: { type: Number, default: 0 },
  monthlyPoints:{ type: Number, default: 0 },
  rank:         { type: Number, default: 0 },
  badges:       [{ type: String }],
  activityLog:  [{
    action:    String,
    points:    Number,
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true })

module.exports = mongoose.model('UserPoints', userPointsSchema)
