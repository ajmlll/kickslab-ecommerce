const express = require('express');
const router = express.Router();
const returnController = require('../controllers/return.controller');
const { protect, adminOnly, authorizeLevels } = require('../middlewares/auth.middleware');

// User Routes
router.post('/', protect, returnController.createReturnRequest);
router.get('/user', protect, returnController.getUserReturns);
router.put('/:id/cancel', protect, returnController.cancelReturnRequest);

// Admin Routes
router.get('/admin/all', protect, adminOnly, returnController.getReturnsForAdmin);
router.put('/admin/:id/status', protect, adminOnly, returnController.updateReturnStatus);
router.delete('/admin/:id', protect, adminOnly, returnController.deleteReturn);

module.exports = router;
