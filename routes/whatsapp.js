const express = require('express')
const router = express.Router()
const WhatsappChat = require('../models/WhatsappChat')
const WhatsappMessage = require('../models/WhatsappMessage')
const { protect } = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')
const { sendError } = require('../utils/errors')

// Company scope: superadmin sees all, everyone else their own company.
const scope = (user) =>
  user.role === 'superadmin' ? {} : { company: user.company || '' }

// ─── GET /api/whatsapp/chats -> [{ _id, name, phone, lastMsg, time, unread }] ──
router.get('/chats', protect, checkTrial, async (req, res) => {
  try {
    const chats = await WhatsappChat.find(scope(req.user))
      .sort({ time: -1, updatedAt: -1 })
      .select('name phone lastMsg time unread')
    res.json(chats)
  } catch (err) {
    sendError(res, err)
  }
})

// ─── POST /api/whatsapp/chats -> create a chat thread ─────────────────────────
router.post('/chats', protect, checkTrial, async (req, res) => {
  try {
    const { name, phone } = req.body
    if (!name) return res.status(400).json({ message: 'name is required' })
    const chat = await WhatsappChat.create({
      name,
      phone: phone || '',
      company: req.user.company || '',
      createdBy: req.user.id
    })
    res.status(201).json(chat)
  } catch (err) {
    sendError(res, err)
  }
})

// ─── GET messages -> [{ from, text, time }] ───────────────────────────────────
router.get('/chats/:id/messages', protect, checkTrial, async (req, res) => {
  try {
    const chat = await WhatsappChat.findOne({ _id: req.params.id, ...scope(req.user) })
    if (!chat) return res.status(404).json({ message: 'Chat not found' })

    // Opening a chat clears its unread count
    if (chat.unread > 0) { chat.unread = 0; await chat.save() }

    const messages = await WhatsappMessage.find({ chat: chat._id })
      .sort({ time: 1 })
      .select('from text time')
    res.json(messages)
  } catch (err) {
    sendError(res, err)
  }
})

// ─── POST message {text} -> save + return the message ─────────────────────────
router.post('/chats/:id/messages', protect, checkTrial, async (req, res) => {
  try {
    const { text } = req.body
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'text is required' })
    }
    const chat = await WhatsappChat.findOne({ _id: req.params.id, ...scope(req.user) })
    if (!chat) return res.status(404).json({ message: 'Chat not found' })

    const now = new Date()
    const message = await WhatsappMessage.create({
      chat: chat._id,
      from: 'me',
      text: text.trim(),
      time: now,
      company: chat.company
    })

    chat.lastMsg = message.text
    chat.time = now
    await chat.save()

    res.status(201).json({ from: message.from, text: message.text, time: message.time })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
