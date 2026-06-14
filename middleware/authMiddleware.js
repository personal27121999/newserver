const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const DeliveryBoy = require('../models/DeliveryBoy');
const Customer = require('../models/Customer');

// ── Admin ──────────────────────────────────────
const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer'))
      token = req.headers.authorization.split(' ')[1];
    if (!token)
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Admin access required.' });

    const admin = await Admin.findById(decoded.id);
    if (!admin || !admin.isActive)
      return res.status(401).json({ success: false, message: 'Admin not found or deactivated.' });

    req.admin = admin;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

// ── Delivery Boy ───────────────────────────────
const protectDelivery = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer'))
      token = req.headers.authorization.split(' ')[1];
    if (!token)
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'delivery')
      return res.status(403).json({ success: false, message: 'Delivery boy access required.' });

    const deliveryBoy = await DeliveryBoy.findById(decoded.id);
    if (!deliveryBoy || !deliveryBoy.isActive)
      return res.status(401).json({ success: false, message: 'Account not found or deactivated.' });

    req.deliveryBoy = deliveryBoy;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

// ── Customer ───────────────────────────────────
const protectCustomer = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer'))
      token = req.headers.authorization.split(' ')[1];
    if (!token)
      return res.status(401).json({ success: false, message: 'Please login to continue.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'customer')
      return res.status(403).json({ success: false, message: 'Customer access required.' });

    const customer = await Customer.findById(decoded.id);
    if (!customer || !customer.isActive)
      return res.status(401).json({ success: false, message: 'Account not found or blocked.' });

    req.customer = customer;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

// ── Role check ──────────────────────────────────
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.admin?.role))
    return res.status(403).json({ success: false, message: `Role '${req.admin?.role}' not authorized.` });
  next();
};

module.exports = { protect, protectDelivery, protectCustomer, authorize };
