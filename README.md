# Kickslab - Premium Sneaker E-commerce Platform

Kickslab is a full-featured MERN stack e-commerce application designed for sneaker enthusiasts. It features a modern, responsive UI, secure payment integration, and a robust admin dashboard for platform management.

## 🚀 Features

### User Features
- **Modern UI/UX**: Sleek, responsive design for a premium shopping experience.
- **Product Gallery**: Browse sneakers with high-quality images and detailed descriptions.
- **Advanced Filtering**: Filter products by category, price, and color.
- **Shopping Cart**: Dynamic cart with real-time updates and persistence.
- **Secure Checkout**: Integrated with Razorpay for safe and seamless transactions.
- **User Authentication**: Secure login/signup with JWT and Google OAuth integration.
- **Order Tracking**: View order history and status updates.
- **Product Reviews**: Customer feedback and rating system.

### Admin Features
- **Comprehensive Dashboard**: Real-time sales analytics and platform stats.
- **Inventory Management**: Full CRUD operations for products and categories.
- **Order Management**: Track, update, and manage customer orders.
- **User Management**: View and manage site members.
- **Role-Based Access**: Secure admin portal with SuperAdmin/Admin permissions.

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (Modern ES6+)
- **Backend**: Node.js, Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Authentication**: JWT, Passport.js (Google OAuth)
- **Payments**: Razorpay API
- **Utilities**: Multer (File Uploads), Nodemailer (Emails), PDFKit (Invoices)

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/kickslab.git
   cd kickslab
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   - Create a `.env` file in the root directory.
   - Use `.env.example` as a template and fill in your credentials (MongoDB URI, Razorpay keys, Google Auth secrets, etc.).

4. **Run the application**:
   - Development mode:
     ```bash
     npm run dev
     ```
   - Production mode:
     ```bash
     npm start
     ```

## 📸 Screenshots

*(Add your screenshots to the `screenshots/` directory and link them here)*

![Landing Page](./screenshots/landing_page.png)
![Product Page](./screenshots/product_page.png)
![Admin Dashboard](./screenshots/admin_dashboard.png)

## 📄 License

This project is licensed under the MIT License.
