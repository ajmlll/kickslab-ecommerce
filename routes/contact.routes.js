const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contact.controller');

const { protect, adminOnly } = require('../middlewares/auth.middleware');

// POST /api/contact/send-message
router.post('/send-message', contactController.sendMessage);

// Admin Routes
router.get('/admin/all', protect, adminOnly, contactController.getAllMessages);
router.patch('/admin/:id/read', protect, adminOnly, contactController.markAsRead);

module.exports = router;
