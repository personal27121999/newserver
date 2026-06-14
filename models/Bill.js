const mongoose = require('mongoose');

const billItemSchema = new mongoose.Schema({
  product:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName:  { type: String, required: true },
  productCode:  { type: String },
  unit:         { type: String },        // unit name (string snapshot)
  mrp:          { type: Number, required: true },   // original selling price
  rate:         { type: Number, required: true },   // actual rate after discount
  quantity:     { type: Number, required: true, min: 0.001 },
  discountPct:  { type: Number, default: 0 },       // % discount on this item
  discountAmt:  { type: Number, default: 0 },       // calculated discount ₹
  taxPct:       { type: Number, default: 0 },       // GST %
  taxAmt:       { type: Number, default: 0 },       // calculated GST ₹
  subtotal:     { type: Number, required: true }    // qty * rate (after item discount, before tax)
});

const billSchema = new mongoose.Schema({
  billNumber:    { type: String, unique: true },

  // Customer info (optional — walk-in customer allowed)
  customer:      { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerName:  { type: String, default: 'Walk-in Customer' },
  customerPhone: { type: String, default: '' },

  // Billed by
  billedBy:      { type: String, required: true },   // admin name

  // Items
  items: [billItemSchema],

  // Calculation
  subtotal:        { type: Number, required: true },  // sum of item subtotals
  discountType:    { type: String, enum: ['none', 'flat', 'percent'], default: 'none' },
  discountValue:   { type: Number, default: 0 },      // flat ₹ or percent %
  discountAmount:  { type: Number, default: 0 },      // calculated overall discount ₹
  taxAmount:       { type: Number, default: 0 },      // sum of item taxes
  roundOff:        { type: Number, default: 0 },      // +/- rounding
  totalAmount:     { type: Number, required: true },  // final payable

  // Payment
  paymentMethod:  { type: String, enum: ['cash', 'upi', 'card', 'credit'], default: 'cash' },
  amountPaid:     { type: Number, default: 0 },
  changeReturned: { type: Number, default: 0 },       // amountPaid - totalAmount (cash)
  paymentStatus:  { type: String, enum: ['paid', 'partial', 'unpaid'], default: 'paid' },

  notes: { type: String, default: '' },

  // Bill type
  billType: { type: String, enum: ['counter', 'estimate'], default: 'counter' }

}, { timestamps: true });

billSchema.pre('save', async function (next) {
  if (!this.billNumber) {
    const count = await mongoose.model('Bill').countDocuments();
    const d = new Date();
    const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    this.billNumber = `BILL${ds}${String(count + 1).padStart(4,'0')}`;
  }
  next();
});

billSchema.index({ customer: 1 });
billSchema.index({ createdAt: -1 });
billSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Bill', billSchema);
