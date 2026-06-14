const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: String,
  productImage: String,
  price: { type: Number, required: true },
  discountPrice: Number,
  quantity: { type: Number, required: true, min: 1 },
  unit: String,
  subtotal: { type: Number, required: true }
});

const statusHistorySchema = new mongoose.Schema({
  status: String,
  timestamp: { type: Date, default: Date.now },
  updatedBy: String,
  note: String
});

const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  customerName: String,
  customerPhone: String,
  items: [orderItemSchema],
  deliveryAddress: {
    address: { type: String, required: true },
    buildingName: { type: String, required: true },
    landmark: String,
    city: String,
    pincode: String
  },
  deliveryInstructions: String,
  preferredDeliveryTime: String,
  subtotal: { type: Number, required: true },
  deliveryCharge: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  paymentMethod: {
    type: String,
    enum: ['cash_on_delivery', 'online', 'upi'],
    default: 'cash_on_delivery'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'accepted', 'preparing', 'packed', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'pending'
  },
  assignedDeliveryBoy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryBoy',
    default: null
  },
  deliveryBoyName: String,
  statusHistory: [statusHistorySchema],
  cancellationReason: String,
  notes: String
}, { timestamps: true });

// Auto-generate orderId
orderSchema.pre('save', async function(next) {
  if (!this.orderId) {
    const count = await mongoose.model('Order').countDocuments();
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
    this.orderId = `ORD${dateStr}${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ customer: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ customerName: 1 });

module.exports = mongoose.model('Order', orderSchema);
