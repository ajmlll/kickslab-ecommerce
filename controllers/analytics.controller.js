const Order = require("../models/order.model.js");
const User = require("../models/user.model.js");
const Product = require("../models/Product.js");
const Coupon = require("../models/Coupon.js");
const Category = require("../models/category.model.js");
const Offer = require("../models/offer.model.js"); // Added
const Return = require("../models/return.model.js"); // Added
const mongoose = require("mongoose");

exports.getAnalyticsData = async (req, res) => {
    try {
        const { range } = req.query;
        let startDate = new Date();
        let previousStartDate = new Date();

        // 1. Determine Date Range
        switch (range) {
            case 'Last 7 Days':
                startDate.setDate(startDate.getDate() - 7);
                previousStartDate.setDate(previousStartDate.getDate() - 14);
                break;
            case 'Last 30 Days':
                startDate.setDate(startDate.getDate() - 30);
                previousStartDate.setDate(previousStartDate.getDate() - 60);
                break;
            case 'Last 3 Months':
                startDate.setMonth(startDate.getMonth() - 3);
                previousStartDate.setMonth(previousStartDate.getMonth() - 6);
                break;
            case 'Last Year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                previousStartDate.setFullYear(previousStartDate.getFullYear() - 2);
                break;
            default:
                startDate.setDate(startDate.getDate() - 30); // Default to 30 days
                previousStartDate.setDate(previousStartDate.getDate() - 60);
        }

        // 2. Aggregate Metrics
        const currentOrders = await Order.find({ createdAt: { $gte: startDate } });
        const previousOrders = await Order.find({ createdAt: { $gte: previousStartDate, $lt: startDate } });

        const calculateStats = (orders) => {
            const revenue = orders.reduce((sum, o) => sum + (o.orderStatus !== 'Cancelled' ? o.totalAmount : 0), 0);
            return {
                revenue,
                ordersCount: orders.length,
                aov: orders.length > 0 ? revenue / orders.length : 0,
                activeUsers: new Set(orders.map(o => o.userId.toString())).size
            };
        };

        const currentStats = calculateStats(currentOrders);
        const previousStats = calculateStats(previousOrders);

        const getTrend = (curr, prev) => {
            if (prev === 0) return 0;
            return ((curr - prev) / prev) * 100;
        };

        // Conversion Rate (Mocked since we don't have visits data, but logic ready)
        const visits = currentOrders.length * 20; // Example visit multiplier
        const prevVisits = previousOrders.length * 20;
        const convRate = visits > 0 ? (currentOrders.length / visits) * 100 : 0;
        const prevConvRate = prevVisits > 0 ? (previousOrders.length / prevVisits) * 100 : 0;

        // 3. Sales Overview (Revenue & Orders by Date)
        const salesOverview = await Order.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    revenue: { $sum: { $cond: [{ $ne: ["$orderStatus", "Cancelled"] }, "$totalAmount", 0] } },
                    orders: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // 4. Top Selling Products
        const topProducts = await Order.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.product",
                    name: { $first: "$items.productName" },
                    unitsSold: { $sum: "$items.quantity" },
                    revenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } }
                }
            },
            { $sort: { unitsSold: -1 } },
            { $limit: 10 }
        ]);

        // 5. Payment Methods
        const paymentMethods = await Order.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            { $group: { _id: "$paymentMethod", count: { $sum: 1 } } }
        ]);

        // 6. Order Status Breakdown
        const orderStatuses = await Order.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            { $group: { _id: "$orderStatus", count: { $sum: 1 } } }
        ]);

        const refundedOrdersCount = await Order.countDocuments({
            createdAt: { $gte: startDate },
            paymentStatus: "Refunded"
        });

        const returnCounts = await Return.countDocuments({
            createdAt: { $gte: startDate }
        });

        // Combine categories for breakdown
        const statusBreakdown = [
            ...orderStatuses,
            { _id: "Refunded", count: refundedOrdersCount },
            { _id: "Returned", count: returnCounts }
        ].filter(s => s.count > 0);

        // 7. Coupon Performance
        const couponPerformance = await Order.aggregate([
            { $match: { createdAt: { $gte: startDate }, couponCode: { $exists: true, $ne: null } } },
            {
                $group: {
                    _id: "$couponCode",
                    uses: { $sum: 1 },
                    revenue: { $sum: "$totalAmount" }
                }
            },
            { $sort: { revenue: -1 } }
        ]);

        // 8. Customer Insights & Metrics Preparation
        const newCustomers = await User.countDocuments({ createdAt: { $gte: startDate }, role: 'user' });
        const totalCustomersWithOrders = await Order.distinct('userId', { createdAt: { $gte: startDate } });
        const returningCustomers = totalCustomersWithOrders.length - newCustomers; // Approximation

        const customerInsights = {
            newCustomers,
            returningCustomers: Math.max(0, returningCustomers),
            repeatRate: totalCustomersWithOrders.length > 0 ? (returningCustomers / totalCustomersWithOrders.length) * 100 : 0
        };

        // 9. Offer Performance
        const offers = await Offer.find({ isActive: true });
        const offerPerformance = [];

        for (const offer of offers) {
            // Find orders within offer period
            const offerOrders = await Order.find({
                createdAt: { $gte: offer.startDate, $lte: offer.endDate },
                orderStatus: { $ne: "Cancelled" }
            }).populate('items.product');

            let usages = 0;
            let revenue = 0;

            offerOrders.forEach(order => {
                order.items.forEach(item => {
                    let isTarget = false;
                    const product = item.product;

                    if (product) {
                        if (offer.offerType === 'product' && product._id.toString() === offer.targetId.toString()) {
                            isTarget = true;
                        } else if (offer.offerType === 'category' && product.category && product.category.toString() === offer.targetId.toString()) {
                            isTarget = true;
                        } else if (offer.offerType === 'brand' && product.brand && product.brand.toString() === offer.targetId.toString()) {
                            isTarget = true;
                        }
                    }

                    if (isTarget) {
                        usages += item.quantity;
                        revenue += item.price * item.quantity;
                    }
                });
            });

            if (usages > 0) {
                offerPerformance.push({
                    title: offer.title,
                    type: offer.offerType,
                    uses: usages,
                    revenue: revenue
                });
            }
        }

        const metrics = {
            revenue: { value: currentStats.revenue, trend: getTrend(currentStats.revenue, previousStats.revenue) },
            orders: { value: currentStats.ordersCount, trend: getTrend(currentStats.ordersCount, previousStats.ordersCount) },
            aov: { value: currentStats.aov, trend: getTrend(currentStats.aov, previousStats.aov) },
            activeUsers: { value: currentStats.activeUsers, trend: getTrend(currentStats.activeUsers, previousStats.activeUsers) },
            conversionRate: { value: convRate, trend: getTrend(convRate, prevConvRate) }
        };

        // 10. Generate AI Insights
        const insights = [];

        // Revenue Insight
        if (metrics.revenue.trend > 0) {
            insights.push({
                type: 'growth',
                title: 'Revenue Growth Detected',
                text: `Your revenue is up ${metrics.revenue.trend.toFixed(1)}% compared to the previous period. Sales momentum is strong.`
            });
        } else if (metrics.revenue.trend < 0) {
            insights.push({
                type: 'warning',
                title: 'Revenue Dip',
                text: `Revenue decreased by ${Math.abs(metrics.revenue.trend).toFixed(1)}%. Consider analyzing your top products' availability.`
            });
        }

        // Top Product Insight
        if (topProducts.length > 0) {
            insights.push({
                type: 'product',
                title: 'Star Product Identified',
                text: `${topProducts[0].name || 'A top product'} is your best seller this period, contributing ${((topProducts[0].revenue / metrics.revenue.value) * 100).toFixed(1)}% of total revenue.`
            });
        }

        // Loyalty Insight
        if (customerInsights.repeatRate > 20) {
            insights.push({
                type: 'retention',
                title: 'High Customer Loyalty',
                text: `${customerInsights.repeatRate.toFixed(1)}% of your customers are returning. Your brand retention strategy is performing well.`
            });
        } else {
            insights.push({
                type: 'retention',
                title: 'Retention Opportunity',
                text: `Only ${customerInsights.repeatRate.toFixed(1)}% of customers are returning. Consider a loyalty program or follow-up email campaigns.`
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                metrics,
                salesOverview,
                paymentMethods,
                topProducts,
                couponPerformance: couponPerformance.slice(0, 5),
                offerPerformance: offerPerformance.slice(0, 5),
                statusBreakdown,
                customerInsights,
                insights
            }
        });
    } catch (error) {
        console.error("Analytics Error:", error);
        res.status(500).json({ success: false, error: "Failed to fetch analytics." });
    }
};

const PDFDocument = require("pdfkit");

exports.downloadReport = async (req, res) => {
    try {
        const { range } = req.query;
        // Re-calculate or reuse aggregation logic (for a real app, refactor to shared service)
        // For now, we'll implement a concise version for the PDF

        let startDate = new Date();
        switch (range) {
            case 'Last 7 Days': startDate.setDate(startDate.getDate() - 7); break;
            case 'Last 30 Days': startDate.setDate(startDate.getDate() - 30); break;
            case 'Last 3 Months': startDate.setMonth(startDate.getMonth() - 3); break;
            case 'Last Year': startDate.setFullYear(startDate.getFullYear() - 1); break;
            default: startDate.setDate(startDate.getDate() - 30);
        }

        const orders = await Order.find({ createdAt: { $gte: startDate } }).sort({ createdAt: -1 });
        const revenue = orders.reduce((sum, o) => sum + (o.orderStatus !== 'Cancelled' ? o.totalAmount : 0), 0);

        const doc = new PDFDocument({ margin: 50 });
        let filename = `Kickslab_Report_${range.replace(/ /g, '_')}.pdf`;

        res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
        res.setHeader('Content-type', 'application/pdf');

        // Header
        doc.fillColor("#444444").fontSize(20).text("KICKSLAB BUSINESS REPORT", { align: "center" });
        doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: "center" });
        doc.fontSize(12).text(`Period: ${range}`, { align: "center" });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Summary Metrics
        doc.fontSize(14).fillColor("#333333").text("Summary Metrics", { underline: true });
        doc.fontSize(10).moveDown();
        doc.text(`Total Revenue: INR ${revenue.toLocaleString()}`);
        doc.text(`Total Orders: ${orders.length}`);
        doc.text(`Avg. Order Value: INR ${(orders.length > 0 ? revenue / orders.length : 0).toLocaleString()}`);
        doc.text(`Active Customers: ${new Set(orders.map(o => o.userId.toString())).size}`);
        doc.moveDown();

        // Top Products Section
        doc.fontSize(14).text("Top Selling Products", { underline: true });
        doc.moveDown();

        // Manual aggregation for PDF (simplified)
        const productStats = {};
        orders.forEach(o => {
            if (o.orderStatus !== 'Cancelled') {
                o.items.forEach(item => {
                    const id = item.product.toString();
                    if (!productStats[id]) productStats[id] = { name: item.productName, units: 0, revenue: 0 };
                    productStats[id].units += item.quantity;
                    productStats[id].revenue += item.quantity * item.price;
                });
            }
        });

        const topProductsList = Object.values(productStats).sort((a, b) => b.units - a.units).slice(0, 5);

        doc.fontSize(10).font("Helvetica-Bold");
        doc.text("Product Name", 50, doc.y);
        doc.text("Units", 300, doc.y);
        doc.text("Revenue", 400, doc.y);
        doc.font("Helvetica").fontSize(8).moveDown();

        topProductsList.forEach(p => {
            doc.text(p.name, 50, doc.y);
            doc.text(p.units.toString(), 300, doc.y - 12);
            doc.text(`INR ${p.revenue.toLocaleString()}`, 400, doc.y - 12);
            doc.moveDown();
        });
        doc.moveDown();

        // Recent Orders Table
        doc.fontSize(14).font("Helvetica").text("Latest Orders", { underline: true });
        doc.moveDown();

        let tableTop = doc.y;
        doc.fontSize(10).font("Helvetica-Bold");
        doc.text("Order ID", 50, tableTop);
        doc.text("Date", 150, tableTop);
        doc.text("Status", 250, tableTop);
        doc.text("Method", 350, tableTop);
        doc.text("Amount", 450, tableTop);

        doc.font("Helvetica").fontSize(8);
        let y = tableTop + 20;

        orders.slice(0, 15).forEach(order => {
            doc.text(order._id.toString().substring(0, 10), 50, y);
            doc.text(order.createdAt.toLocaleDateString(), 150, y);
            doc.text(order.orderStatus, 250, y);
            doc.text(order.paymentMethod.toUpperCase(), 350, y);
            doc.text(`INR ${order.totalAmount.toLocaleString()}`, 450, y);
            y += 15;
            if (y > 700) { doc.addPage(); y = 50; }
        });

        doc.end();
        doc.pipe(res);

    } catch (error) {
        console.error("PDF Export Error:", error);
        res.status(500).json({ success: false, error: "Failed to generate report." });
    }
};
