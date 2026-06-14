require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const { initSocket } = require('./socket/socketManager');
const { seedAdmin } = require('./utils/seedAdmin');
const { seedCatalog } = require('./utils/seedCatalog');

// Route imports
const authRoutes          = require('./routes/authRoutes');
const productRoutes       = require('./routes/productRoutes');
const orderRoutes         = require('./routes/orderRoutes');
const inventoryRoutes     = require('./routes/inventoryRoutes');
const customerRoutes      = require('./routes/customerRoutes');
const deliveryBoyRoutes   = require('./routes/deliveryBoyRoutes');
const deliveryRoutes      = require('./routes/deliveryRoutes');
const dashboardRoutes     = require('./routes/dashboardRoutes');
const notificationRoutes  = require('./routes/notificationRoutes');
const customerAuthRoutes  = require('./routes/customerAuthRoutes');
const shopRoutes          = require('./routes/shopRoutes');
const catalogRoutes   = require('./routes/catalogRoutes');
const billingRoutes   = require('./routes/billingRoutes');

const app = express();
const server = http.createServer(app);

initSocket(server);
connectDB().then(() => { seedAdmin(); seedCatalog(); });

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use('/api/', limiter);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API Routes ──────────────────────────────────
// Admin Auth + Delivery Auth
app.use('/api/auth',           authRoutes);
// Admin: manage products, orders, customers, delivery boys, dashboard
app.use('/api/products',       productRoutes);
app.use('/api/orders',         orderRoutes);
app.use('/api/inventory',      inventoryRoutes);
app.use('/api/customers',      customerRoutes);
app.use('/api/delivery-boys',  deliveryBoyRoutes);
app.use('/api/dashboard',      dashboardRoutes);
app.use('/api/notifications',  notificationRoutes);
// Delivery Boy Panel
app.use('/api/delivery',       deliveryRoutes);
// Customer Auth (OTP login)
app.use('/api/customer-auth',  customerAuthRoutes);
// Customer Shop (browse, cart, orders)
app.use('/api/shop',           shopRoutes);
app.use('/api/catalog',     catalogRoutes);
app.use('/api/billing',     billingRoutes);

app.get('/api/health', (req, res) =>
  res.json({ success: true, message: 'GroceryShop API running ✅', timestamp: new Date() })
);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Global Error:', err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.use((req, res) =>
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` })
);

const PORT = process.env.PORT || 5000;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.error(`   Run this to find and kill the process:`);
    console.error(`   Windows: netstat -ano | findstr :${PORT}  then  taskkill /PID <PID> /F`);
    console.error(`   Mac/Linux: lsof -ti:${PORT} | xargs kill -9\n`);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Server:         http://localhost:${PORT}`);
  console.log(`📊 Admin API:      http://localhost:${PORT}/api`);
  console.log(`🛵 Delivery API:   http://localhost:${PORT}/api/delivery`);
  console.log(`🛒 Shop API:       http://localhost:${PORT}/api/shop`);
  console.log(`🌿 Environment:    ${process.env.NODE_ENV}\n`);
});

module.exports = { app, server };
