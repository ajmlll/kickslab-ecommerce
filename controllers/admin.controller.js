const Order = require("../models/order.model");
const User = require("../models/user.model");
const Transaction = require("../models/Transaction");
const Return = require("../models/return.model");
const Review = require("../models/review.model");
const Product = require("../models/Product");
const ContactMessage = require("../models/ContactMessage");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");

exports.getDashboardStats = catchAsync(async (req, res, next) => {
    const { range } = req.query;
    let startDate = new Date(0); // Default to All Time
    const now = new Date();

    if (range === "Today") {
        startDate = new Date(now.setHours(0, 0, 0, 0));
    } else if (range === "Last 7 Days") {
        startDate = new Date(now.setDate(now.getDate() - 7));
    } else if (range === "Last 1 Month") {
        startDate = new Date(now.setMonth(now.getMonth() - 1));
    } else if (range === "Last 6 Months") {
        startDate = new Date(now.setMonth(now.getMonth() - 6));
    } else if (range === "Last 1 Year") {
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
    }

    const stats = await Promise.all([
        Order.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: { $ne: "Cancelled" } } },
            { $group: { _id: null, totalSales: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
        ]),
        User.countDocuments({ createdAt: { $gte: startDate }, role: "user" }),
        Order.countDocuments({ createdAt: { $gte: startDate } })
    ]);

    const netSales = stats[0].length > 0 ? stats[0][0].totalSales : 0;
    const newCustomers = stats[1];
    const totalOrders = stats[2];

    const graphData = await Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                successful: {
                    $sum: { $cond: [{ $ne: ["$orderStatus", "Cancelled"] }, 1, 0] }
                },
                cancelled: {
                    $sum: { $cond: [{ $eq: ["$orderStatus", "Cancelled"] }, 1, 0] }
                }
            }
        },
        { $sort: { "_id": 1 } }
    ]);

    res.status(200).json({
        success: true,
        data: {
            netSales,
            totalOrders,
            newCustomers,
            graphData: {
                labels: graphData.map(d => d._id),
                successful: graphData.map(d => d.successful),
                cancelled: graphData.map(d => d.cancelled)
            }
        }
    });
});

exports.getTransactions = catchAsync(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const dateFilter = req.query.date || "All Time";
    const typeFilter = req.query.type || "All";

    let dateQuery = {};
    if (dateFilter !== "All Time") {
        const now = new Date();
        let startDate = new Date();
        if (dateFilter === "Today") {
            startDate.setHours(0, 0, 0, 0);
        } else if (dateFilter === "This Week") {
            startDate.setDate(now.getDate() - now.getDay());
            startDate.setHours(0, 0, 0, 0);
        } else if (dateFilter === "This Month") {
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
        }
        dateQuery = { createdAt: { $gte: startDate } };
    }

    let userIds = [];
    if (search) {
        const users = await User.find({ name: { $regex: search, $options: "i" } }).select("_id");
        userIds = users.map(u => u._id);
    }

    let transactions = [];

    if (typeFilter === "All" || typeFilter === "Credit") {
        let orderQuery = { ...dateQuery, paymentStatus: { $in: ["Paid", "Refunded"] } };

        if (search) {
            const searchQueries = [];
            if (userIds.length > 0) searchQueries.push({ userId: { $in: userIds } });
            if (searchQueries.length > 0) {
                orderQuery.$or = searchQueries;
            }
        }

        const orders = await Order.find(orderQuery).populate("userId", "name").lean();

        for (let order of orders) {
            const pseudoId = `TRX-${order._id.toString().slice(-8).toUpperCase()}`;

            let matchesSearch = false;
            if (!search) matchesSearch = true;
            else {
                const s = search.toLowerCase();
                if (pseudoId.toLowerCase().includes(s)) matchesSearch = true;
                if (order.userId && order.userId.name && order.userId.name.toLowerCase().includes(s)) matchesSearch = true;

                const itemNames = order.items.map(i => i.productName).join(" ").toLowerCase();
                if (itemNames.includes(s)) matchesSearch = true;
            }

            if (matchesSearch) {
                let itemDesc = "Multiple Items";
                if (order.items && order.items.length === 1) {
                    itemDesc = `${order.items[0].productName} (x${order.items[0].quantity})`;
                } else if (order.items && order.items.length > 1) {
                    itemDesc = `${order.items[0].productName} (x${order.items[0].quantity}) +${order.items.length - 1} more`;
                }

                let methodStr = "Online";
                if (order.paymentMethod === "wallet") methodStr = "Wallet";
                if (order.paymentMethod === "cod") methodStr = "COD";
                if (order.paymentMethod === "card") methodStr = "Online";

                transactions.push({
                    trxId: pseudoId,
                    date: order.createdAt,
                    customerName: order.userId ? order.userId.name : "Unknown",
                    item: itemDesc,
                    method: methodStr,
                    type: "Credit",
                    amount: order.totalAmount,
                    status: order.paymentStatus === "Refunded" ? "Refunded" : "Success",
                    timestamp: new Date(order.createdAt).getTime()
                });
            }
        }
    }

    if (typeFilter === "All" || typeFilter === "Debit") {
        let trxQuery = { ...dateQuery, type: "Credit" };

        if (search && userIds.length > 0) {
            trxQuery.userId = { $in: userIds };
        }

        const walletTrxs = await Transaction.find(trxQuery).populate("userId", "name").lean();

        for (let trx of walletTrxs) {
            const pseudoId = `REF-${trx._id.toString().slice(-8).toUpperCase()}`;

            let matchesSearch = false;
            if (!search) matchesSearch = true;
            else {
                const s = search.toLowerCase();
                if (pseudoId.toLowerCase().includes(s)) matchesSearch = true;
                if (trx.userId && trx.userId.name && trx.userId.name.toLowerCase().includes(s)) matchesSearch = true;
            }

            if (matchesSearch) {
                transactions.push({
                    trxId: pseudoId,
                    date: trx.createdAt,
                    customerName: trx.userId ? trx.userId.name : "Unknown",
                    item: "Wallet Refund",
                    method: "Wallet",
                    type: "Debit",
                    amount: trx.amount,
                    status: "Success",
                    timestamp: new Date(trx.createdAt).getTime()
                });
            }
        }
    }

    transactions.sort((a, b) => b.timestamp - a.timestamp);

    const totalRecords = transactions.length;
    const totalPages = Math.ceil(totalRecords / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedTransactions = transactions.slice(startIndex, startIndex + limit);

    res.status(200).json({
        success: true,
        transactions: paginatedTransactions,
        totalRecords,
        totalPages,
        currentPage: page
    });
});

exports.getNotifications = catchAsync(async (req, res, next) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
        pendingOrders,
        pendingReturns,
        pendingReviews,
        newCustomers,
        lowStockProducts,
        failedPayments,
        unreadMessages
    ] = await Promise.all([
        Order.countDocuments({ orderStatus: "Pending" }),
        Return.countDocuments({ status: "Pending" }),
        Review.countDocuments({ status: "Pending" }),
        User.countDocuments({ role: "user", createdAt: { $gte: today } }),
        Product.countDocuments({ stock: { $lt: 5 } }),
        Order.countDocuments({ paymentStatus: "Failed" }),
        ContactMessage.countDocuments({ isRead: false })
    ]);

    res.status(200).json({
        success: true,
        data: {
            pendingOrders,
            pendingReturns,
            pendingReviews,
            newCustomers,
            lowStockProducts,
            failedPayments,
            unreadMessages
        }
    });
});
