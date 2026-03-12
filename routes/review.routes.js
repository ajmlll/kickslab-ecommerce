const express = require('express');
const router = express.Router();
const {
    addReview,
    getReviewsForAdmin,
    getProductReviews,
    updateReviewStatus,
    deleteReview,
    checkReviewExists
} = require('../controllers/review.controller');
const { protect, adminOnly, authorizeLevels } = require('../middlewares/auth.middleware');
const reviewUpload = require('../middlewares/reviewUpload');

// Middleware helper for robust file upload error handling
const uploadHandler = (req, res, next) => {
    reviewUpload.array('images', 4)(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: `Upload Error: ${err.message}` });
        }
        next();
    });
};

// Public routes
router.get('/product/:productId', getProductReviews);

// Private User Routes
router.get('/check', protect, checkReviewExists);
router.post('/', protect, uploadHandler, addReview);

// Private Admin Routes
router.get('/admin', protect, adminOnly, getReviewsForAdmin);
router.put('/admin/:id/status', protect, adminOnly, updateReviewStatus);
router.delete('/admin/:id', protect, adminOnly, deleteReview);

module.exports = router;
