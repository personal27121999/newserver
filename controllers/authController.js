const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const DeliveryBoy = require('../models/DeliveryBoy');

const generateToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// ── ADMIN AUTH ─────────────────────────────────

// @route   POST /api/auth/admin/login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password are required' });

    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin || !(await admin.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid email or password' });

    if (!admin.isActive)
      return res.status(403).json({ success: false, message: 'Account deactivated. Contact support.' });

    admin.lastLogin = new Date();
    await admin.save({ validateBeforeSave: false });

    const token = generateToken({ id: admin._id, role: 'admin' });
    res.json({
      success: true, message: 'Login successful',
      data: { token, admin: admin.toJSON() }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   GET /api/auth/admin/profile
const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id);
    res.json({ success: true, data: admin });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   PUT /api/auth/admin/profile
const updateAdminProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const admin = await Admin.findByIdAndUpdate(req.admin._id, { name, email }, { new: true, runValidators: true });
    res.json({ success: true, message: 'Profile updated', data: admin });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   PUT /api/auth/admin/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin._id).select('+password');
    if (!(await admin.comparePassword(currentPassword)))
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    admin.password = newPassword;
    await admin.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── DELIVERY BOY AUTH ──────────────────────────

// @route   POST /api/auth/delivery/login
const deliveryLogin = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password)
      return res.status(400).json({ success: false, message: 'Phone and password are required' });

    const deliveryBoy = await DeliveryBoy.findOne({ phone, isActive: true }).select('+password');
    if (!deliveryBoy || !(await deliveryBoy.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid phone or password' });

    const token = generateToken({ id: deliveryBoy._id, role: 'delivery' });
    res.json({
      success: true, message: 'Login successful',
      data: { token, deliveryBoy: deliveryBoy.toJSON() }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   GET /api/auth/delivery/profile
const getDeliveryProfile = async (req, res) => {
  try {
    const deliveryBoy = await DeliveryBoy.findById(req.deliveryBoy._id);
    res.json({ success: true, data: deliveryBoy });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  adminLogin, getAdminProfile, updateAdminProfile, changePassword,
  deliveryLogin, getDeliveryProfile
};
