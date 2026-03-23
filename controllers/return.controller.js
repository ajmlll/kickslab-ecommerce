const Return = require('../models/return.model');
const Order = require('../models/order.model');
const User = require('../models/user.model');
const Transaction = require('../models/Transaction');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// @desc    Get all returns for Admin
// @route   GET /api/returns/admin
// @access  Private/Admin
const getReturnsForAdmin = catchAsync(async (req, res, next) => {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";

    let query = {};
    if (req.query.status) {
        query.status = req.query.status;
    }

    if (search) {
        // Find matching users
        const matchingUsers = await User.find({
            $or: [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } }
            ]
        }).select('_id').lean();

        const userIds = matchingUsers.map(u => u._id);
        
        // Search Orders by _id if search term is a valid ObjectId
        let orderIds = [];
        if (require('mongoose').Types.ObjectId.isValid(search)) {
            orderIds = [search];
        }

        query.$or = [
            { reason: { $regex: search, $options: "i" } },
            { status: { $regex: search, $options: "i" } },
            { "items.productName": { $regex: search, $options: "i" } }
        ];

        if (userIds.length > 0) {
            query.$or.push({ userId: { $in: userIds } });
        }
        if (orderIds.length > 0) {
            query.$or.push({ orderId: { $in: orderIds } });
        }
    }

    if (page) {
        const skip = (page - 1) * limit;
        const returns = await Return.find(query)
            .populate('userId', 'name email phone')
            .populate({
                path: 'orderId',
                populate: { path: 'userId', select: 'name email' },
                select: 'orderId items totalAmount createdAt' // Ensure items are included
            })
            .sort('-createdAt')
            .skip(skip)
            .limit(limit)
            .lean();

        const totalRecords = await Return.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit) || 1;

        return res.status(200).json({
            status: 'success',
            data: {
                returns: returns,
                total: totalRecords,
                totalPages,
                currentPage: page
            }
        });
    } else {
        const returns = await Return.find(query)
            .populate('userId', 'name email phone')
            .populate({
                path: 'orderId',
                populate: { path: 'userId', select: 'name email' },
                select: 'orderId items totalAmount createdAt' // Ensure items are included
            })
            .sort('-createdAt')
            .lean();

        return res.status(200).json(returns);
    }
});

// @desc    Update return status (Admin)
// @route   PUT /api/returns/admin/:id/status
// @access  Private/Admin
const updateReturnStatus = catchAsync(async (req, res, next) => {
    const { status, adminComment } = req.body;

    if (!['Pending', 'Approved', 'Rejected', 'Refunded'].includes(status)) {
        return next(new AppError('Invalid status', 400));
    }

    const returnReq = await Return.findById(req.params.id);

    if (!returnReq) {
        return next(new AppError('Return request not found', 404));
    }

    if (returnReq.status === 'Approved' || returnReq.status === 'Refunded') {
        return next(new AppError('This return has already been refunded and cannot be modified.', 400));
    }

    // Automatic Refund if Approved
    if (status === 'Approved' && returnReq.status !== 'Approved' && returnReq.status !== 'Refunded') {
        const user = await User.findById(returnReq.userId);
        const order = await Order.findById(returnReq.orderId);

        if (!user || !order) {
            return next(new AppError('User or Order not found for refund', 404));
        }

        // Calculate pro-rated refund accurately
        let totalSellingPrice = order.totalMRP - (order.productDiscount || 0);

        if (!totalSellingPrice || isNaN(totalSellingPrice) || totalSellingPrice <= 0) {
            totalSellingPrice = order.totalAmount;
        }

        const itemsSubtotal = returnReq.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        let refundAmount = (itemsSubtotal / totalSellingPrice) * order.totalAmount;

        if (refundAmount > order.totalAmount) refundAmount = order.totalAmount;

        const roundedRefund = Math.floor(refundAmount * 100) / 100;

        if (isNaN(roundedRefund) || roundedRefund < 0) {
            return next(new AppError('Invalid refund calculation', 400));
        }

        // Update user wallet
        user.walletBalance = (user.walletBalance || 0) + roundedRefund;
        await user.save();

        // Create transaction log
        const transaction = await Transaction.create({
            userId: user._id,
            amount: roundedRefund,
            type: "Credit",
            description: `Refunded by approved return #${returnReq._id.toString().substring(returnReq._id.toString().length - 8).toUpperCase()}`,
            orderId: returnReq.orderId
        });

        // Store refund details in return request
        returnReq.refundAmount = roundedRefund;
        returnReq.refundTransactionId = transaction._id;

        // Update order payment status
        order.paymentStatus = 'Refunded';
        await order.save();
    }

    returnReq.status = (status === 'Approved') ? 'Refunded' : status;
    if (adminComment) returnReq.adminComment = adminComment;
    await returnReq.save();

    res.json({ 
        status: 'success', 
        message: `Return status updated to ${status}`, 
        return: returnReq 
    });
});

// @desc    Delete a return record (Admin)
// @route   DELETE /api/returns/admin/:id
// @access  Private/Admin
const deleteReturn = catchAsync(async (req, res, next) => {
    const returnReq = await Return.findById(req.params.id);

    if (!returnReq) {
        return next(new AppError('Return request not found', 404));
    }

    await returnReq.deleteOne();
    res.json({ message: 'Return record deleted successfully' });
});

// @desc    Create a return request (User)
// @route   POST /api/returns
// @access  Private
const createReturnRequest = catchAsync(async (req, res, next) => {
    const { orderId, items, reason } = req.body;
    const userId = req.user.id;

    if (!orderId || !items || items.length === 0 || !reason) {
        return next(new AppError('Order ID, items, and reason are required', 400));
    }

    // Verify order exists and belongs to user
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
        return next(new AppError('Order not found or access denied', 404));
    }

    // Check 7-day return window from delivery date
    if (!order.deliveredAt && order.orderStatus === 'Delivered') {
        // Fallback if legacy order lacks deliveredAt but is delivered
        order.deliveredAt = order.updatedAt;
    }

    if (!order.deliveredAt) {
        return next(new AppError('Returns can only be requested after the order has been delivered.', 400));
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (new Date(order.deliveredAt) < sevenDaysAgo) {
        return next(new AppError('Return policy exceeded: Returns are only allowed within 7 days of delivery.', 400));
    }

    // Create return request
    const returnReq = new Return({
        orderId,
        userId,
        items: items.map(item => ({ ...item, resolution: 'wallet' })),
        reason,
        evidencePhotos: req.body.evidencePhotos || [],
        pickupAddress: req.body.pickupAddress,
        status: 'Pending'
    });

    await returnReq.save();
    res.status(201).json({ message: 'Return request submitted successfully', return: returnReq });
});

// @desc    Get returns for logged-in user
// @route   GET /api/returns/user
// @access  Private
const getUserReturns = catchAsync(async (req, res, next) => {
    const userId = req.user.id;
    const returns = await Return.find({ userId })
        .populate('orderId', 'orderStatus totalAmount')
        .sort('-createdAt');

    res.json(returns);
});

// @desc    Cancel a return request (User)
// @route   PUT /api/returns/:id/cancel
// @access  Private
const cancelReturnRequest = catchAsync(async (req, res, next) => {
    const userId = req.user.id;
    const returnReq = await Return.findOne({ _id: req.params.id, userId });

    if (!returnReq) {
        return next(new AppError('Return request not found', 404));
    }

    if (returnReq.status !== 'Pending') {
        return next(new AppError(`Cannot cancel a return request that is already ${returnReq.status}`, 400));
    }

    await Return.findOneAndDelete({ _id: req.params.id, userId });

    res.json({ message: 'Return request deleted and cancelled successfully' });
});

module.exports = {
    getReturnsForAdmin,
    updateReturnStatus,
    deleteReturn,
    createReturnRequest,
    getUserReturns,
    cancelReturnRequest
};
