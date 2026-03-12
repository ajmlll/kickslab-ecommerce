const express = require('express');
const router = express.Router();
const {
    getCoupons,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    applyCoupon,
    getActiveCoupons,
    getAvailableCoupons
} = require('../controllers/coupon.controller');
const { protect, adminOnly, authorizeLevels } = require('../middlewares/auth.middleware');

// Public/User routes
router.post('/apply', protect, applyCoupon);
router.get('/active', protect, getActiveCoupons);
router.get('/user-available', protect, getAvailableCoupons);

// Admin routes
router.get('/admin', protect, adminOnly, getCoupons);
router.post('/admin', protect, adminOnly, createCoupon);
router.put('/admin/:id', protect, adminOnly, updateCoupon);
router.delete('/admin/:id', protect, adminOnly, deleteCoupon);

module.exports = router;
