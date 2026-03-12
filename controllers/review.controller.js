const Review = require('../models/review.model');
const Order = require('../models/order.model');
const Product = require('../models/Product');

// @desc    Add a review
// @route   POST /api/reviews
// @access  Private
const addReview = async (req, res) => {
    try {
        const { productId, orderId, rating, comment, size } = req.body;
        // Fix: Use req.user.id to map to the user who placed the order and is authenticated
        const userId = req.user.id || req.user._id;

        // Validation
        if (!productId || !orderId || !rating || !comment) {
            return res.status(400).json({ error: 'Please provide all required fields' });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        }

        // Verify that the user placed the order and it is Delivered
        const order = await Order.findOne({ _id: orderId, userId: userId });
        if (!order) {
            return res.status(404).json({ error: 'Order not found or does not belong to you' });
        }

        if (order.orderStatus !== 'Delivered') {
            return res.status(400).json({ error: 'You can only review products from delivered orders' });
        }

        // Verify the product is actually in the order
        const productInOrder = order.items.find(item => item.product.toString() === productId);
        if (!productInOrder) {
            return res.status(400).json({ error: 'Product not found in this order' });
        }

        // Removed check for existing review to allow unlimited reviews

        // Handle images if uploaded
        const images = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                // Ensure correct relative path for frontend serving
                images.push(`/uploads/reviews/${file.filename}`);
            });
        }

        // Create the review
        const review = await Review.create({
            user: userId,
            product: productId,
            order: orderId,
            rating,
            size,
            comment,
            images,
            status: 'Pending' // Default status, admin needs to approve
        });

        res.status(201).json({ message: 'Review submitted successfully', review });

    } catch (error) {
        console.error('Error adding review:', error);
        res.status(500).json({ error: 'Internal server error while adding review' });
    }
};

// @desc    Get all reviews for Admin
// @route   GET /api/reviews/admin
// @access  Private/Admin
const getReviewsForAdmin = async (req, res) => {
    try {
        const page = parseInt(req.query.page);
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || "";

        let query = {};

        if (search) {
            // Find matching users and products
            const User = require('../models/userAuth.model');
            const matchingUsers = await User.find({
                $or: [
                    { name: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } }
                ]
            }).select('_id').lean();

            const matchingProducts = await Product.find({
                name: { $regex: search, $options: "i" }
            }).select('_id').lean();

            const userIds = matchingUsers.map(u => u._id);
            const productIds = matchingProducts.map(p => p._id);

            query.$or = [
                { comment: { $regex: search, $options: "i" } }
            ];

            if (userIds.length > 0) {
                query.$or.push({ user: { $in: userIds } });
            }
            if (productIds.length > 0) {
                query.$or.push({ product: { $in: productIds } });
            }
        }

        if (page) {
            const skip = (page - 1) * limit;
            const reviews = await Review.find(query)
                .populate('user', 'name email')
                .populate('product', 'name images')
                .sort('-createdAt')
                .skip(skip)
                .limit(limit)
                .lean();

            const totalRecords = await Review.countDocuments(query);
            const totalPages = Math.ceil(totalRecords / limit) || 1;

            return res.status(200).json({
                success: true,
                data: reviews,
                totalRecords,
                totalPages,
                currentPage: page
            });
        } else {
            const reviews = await Review.find(query)
                .populate('user', 'name email')
                .populate('product', 'name images')
                .sort('-createdAt')
                .lean();

            return res.status(200).json(reviews);
        }
    } catch (error) {
        console.error('Error fetching admin reviews:', error);
        res.status(500).json({ error: 'Internal server error while fetching reviews' });
    }
};

// @desc    Get approved reviews for a specific product
// @route   GET /api/reviews/product/:productId
// @access  Public
const getProductReviews = async (req, res) => {
    try {
        const reviews = await Review.find({
            product: req.params.productId,
            status: 'Approved'
        })
            .populate('user', 'name')
            .sort('-createdAt');

        res.json(reviews);
    } catch (error) {
        console.error('Error fetching product reviews:', error);
        res.status(500).json({ error: 'Internal server error while fetching reviews' });
    }
};

// @desc    Update review status (Admin)
// @route   PUT /api/reviews/:id/status
// @access  Private/Admin
const updateReviewStatus = async (req, res) => {
    try {
        const { status } = req.body;

        if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }

        review.status = status;
        await review.save();

        res.json({ message: `Review status updated to ${status}`, review });
    } catch (error) {
        console.error('Error updating review status:', error);
        res.status(500).json({ error: 'Internal server error while updating review status' });
    }
};

// @desc    Delete a review (Admin)
// @route   DELETE /api/reviews/:id
// @access  Private/Admin
const deleteReview = async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }

        await review.deleteOne();
        res.json({ message: 'Review deleted successfully' });
    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ error: 'Internal server error while deleting review' });
    }
};

// @desc    Check if a user already reviewed a product for an order
// @route   GET /api/reviews/check
// @access  Private
const checkReviewExists = async (req, res) => {
    try {
        const { orderId, productId } = req.query;
        const userId = req.user.id || req.user._id;

        if (!orderId || !productId) {
            return res.status(400).json({ error: 'orderId and productId are required' });
        }

        const existingReview = await Review.findOne({ user: userId, product: productId, order: orderId });

        if (existingReview) {
            return res.json({ exists: true });
        }

        return res.json({ exists: false });

    } catch (error) {
        console.error('Error checking review:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    addReview,
    getReviewsForAdmin,
    getProductReviews,
    updateReviewStatus,
    deleteReview,
    checkReviewExists
};
