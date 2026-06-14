const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');

// Simple 6-digit OTP generator
const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

// @desc    Request OTP (send to phone)
// @route   POST /api/customer-auth/send-otp
const sendOTP = async (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone || !/^[6-9]\d{9}$/.test(phone))
      return res.status(400).json({ success: false, message: 'Enter a valid 10-digit Indian mobile number' });

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Upsert customer — create if new, update OTP if existing
    let customer = await Customer.findOne({ phone });
    if (!customer) {
      if (!name) return res.status(400).json({ success: false, message: 'Name is required for new customers' });
      customer = await Customer.create({ phone, name, otp, otpExpiry });
    } else {
      if (!customer.isActive)
        return res.status(403).json({ success: false, message: 'Your account has been blocked. Contact support.' });
      customer.otp = otp;
      customer.otpExpiry = otpExpiry;
      await customer.save({ validateBeforeSave: false });
    }

    // In production: integrate Twilio/MSG91 to send SMS
    // For dev: return OTP in response
    console.log(`📱 OTP for ${phone}: ${otp}`);

    res.json({
      success: true,
      message: `OTP sent to ${phone}`,
      isNewUser: !customer.totalOrders,
      // DEVELOPMENT ONLY — remove in production:
      ...(process.env.NODE_ENV === 'development' && { otp })
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Verify OTP and login
// @route   POST /api/customer-auth/verify-otp
const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp)
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' });

    const customer = await Customer.findOne({ phone });
    if (!customer)
      return res.status(404).json({ success: false, message: 'Customer not found. Please request OTP first.' });

    if (!customer.otp || !customer.otpExpiry)
      return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });

    if (new Date() > customer.otpExpiry)
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });

    if (customer.otp !== otp)
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });

    // Clear OTP after successful verification
    customer.otp = null;
    customer.otpExpiry = null;
    await customer.save({ validateBeforeSave: false });

    const token = jwt.sign(
      { id: customer._id, role: 'customer' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: { token, customer }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get customer profile
// @route   GET /api/customer-auth/profile
const getCustomerProfile = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer._id);
    res.json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update customer profile
// @route   PUT /api/customer-auth/profile
const updateCustomerProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const customer = await Customer.findByIdAndUpdate(
      req.customer._id,
      { name, email },
      { new: true, runValidators: true }
    );
    res.json({ success: true, message: 'Profile updated', data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add/update address
// @route   POST /api/customer-auth/address
const addAddress = async (req, res) => {
  try {
    const { label, address, buildingName, landmark, city, pincode, isDefault } = req.body;
    const customer = await Customer.findById(req.customer._id);

    if (isDefault) customer.addresses.forEach(a => (a.isDefault = false));
    customer.addresses.push({ label, address, buildingName, landmark, city, pincode, isDefault: !!isDefault });
    await customer.save();

    res.json({ success: true, message: 'Address added', data: customer.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete address
// @route   DELETE /api/customer-auth/address/:addressId
const deleteAddress = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer._id);
    customer.addresses = customer.addresses.filter(a => a._id.toString() !== req.params.addressId);
    await customer.save();
    res.json({ success: true, message: 'Address removed', data: customer.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { sendOTP, verifyOTP, getCustomerProfile, updateCustomerProfile, addAddress, deleteAddress };
