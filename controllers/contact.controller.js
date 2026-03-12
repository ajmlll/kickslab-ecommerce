const ContactMessage = require('../models/ContactMessage');
const transporter = require('../config/mailer');

exports.sendMessage = async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // Backend Validations
        if (!name || name.trim().length < 3) {
            return res.status(400).json({ success: false, message: "Full Name is required and must be at least 3 characters long." });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: "A valid Email Address is required." });
        }

        if (!subject || subject.trim().length < 5) {
            return res.status(400).json({ success: false, message: "Subject is required and must be at least 5 characters long." });
        }

        if (!message || message.trim().length < 10 || message.trim().length > 1000) {
            return res.status(400).json({ success: false, message: "Message is required and must be between 10 and 1000 characters long." });
        }

        // Email Sending
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: 'kickslabshoe@gmail.com', // Admin email
            subject: 'New Contact Message from KICKSLAB Website',
            text: `
Name: ${name.trim()}
Email: ${email.trim()}
Subject: ${subject.trim()}

Message:
${message.trim()}
            `
        };

        await transporter.sendMail(mailOptions);

        // Save to Database
        const newContactMessage = new ContactMessage({
            name: name.trim(),
            email: email.trim(),
            subject: subject.trim(),
            message: message.trim()
        });

        await newContactMessage.save();

        res.status(200).json({
            success: true,
            message: "Message sent successfully"
        });

    } catch (error) {
        console.error("Contact Form Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to send message"
        });
    }
};

// Admin: Get all contact messages
exports.getAllMessages = async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        let query = {};

        if (status === 'unread') query.isRead = false;
        if (status === 'read') query.isRead = true;

        const messages = await ContactMessage.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const totalMessages = await ContactMessage.countDocuments(query);

        res.status(200).json({
            success: true,
            data: messages,
            pagination: {
                totalMessages,
                totalPages: Math.ceil(totalMessages / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error("Get All Messages Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch messages" });
    }
};

// Admin: Mark message as read
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const message = await ContactMessage.findByIdAndUpdate(id, { isRead: true }, { new: true });

        if (!message) {
            return res.status(404).json({ success: false, message: "Message not found" });
        }

        res.status(200).json({ success: true, data: message });
    } catch (error) {
        console.error("Mark As Read Error:", error);
        res.status(500).json({ success: false, message: "Failed to update message" });
    }
};
