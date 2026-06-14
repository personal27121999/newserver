const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const deliveryBoySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^[6-9]\d{9}$/, 'Please provide a valid phone number']
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    sparse: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  vehicleNumber: { type: String, trim: true },
  vehicleType: {
    type: String,
    enum: ['bike', 'scooter', 'bicycle', 'other'],
    default: 'bike'
  },
  isAvailable: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  currentOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  totalDeliveries: { type: Number, default: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 }
}, { timestamps: true });

deliveryBoySchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

deliveryBoySchema.methods.comparePassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

deliveryBoySchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('DeliveryBoy', deliveryBoySchema);
