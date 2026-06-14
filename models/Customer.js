const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  label: { type: String, default: 'Home' },
  address: String,
  buildingName: String,
  landmark: String,
  city: String,
  pincode: String,
  isDefault: { type: Boolean, default: false }
});

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^[6-9]\d{9}$/, 'Please provide a valid Indian phone number']
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    sparse: true,
    default: null
  },
  addresses: [addressSchema],
  totalOrders: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  lastOrderAt: { type: Date, default: null },
  otp: { type: String, default: null },
  otpExpiry: { type: Date, default: null }
}, { timestamps: true });


customerSchema.index({ name: 1 });
module.exports = mongoose.model('Customer', customerSchema);
