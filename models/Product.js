const mongoose = require('mongoose');

const productImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  isPrimary: { type: Boolean, default: false },
  label: { type: String, default: '' }  // e.g. "Front View", "Back View"
});

const productSchema = new mongoose.Schema({
  productId:     { type: String, unique: true },
  productCode:   { type: String, unique: true, sparse: true },
  name:          { type: String, required: [true, 'Product name is required'], trim: true },
  barcode:       { type: String, trim: true, default: null },

  // Classification — ObjectId refs to catalog
  category:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category',    required: [true, 'Category is required'] },
  productType: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductType', required: [true, 'Product type is required'] },
  unit:        { type: mongoose.Schema.Types.ObjectId, ref: 'Unit',        required: [true, 'Unit is required'] },

  // Pricing
  purchasePrice:  { type: Number, min: 0, default: 0 },
  sellingPrice:   { type: Number, required: [true, 'Selling price is required'], min: 0 },
  discountPrice:  { type: Number, min: 0, default: null },

  // Inventory
  currentStock:  { type: Number, default: 0, min: 0 },
  reorderLevel:  { type: Number, default: 10, min: 0 },  // triggers alert
  minimumStock:  { type: Number, default: 0, min: 0 },
  maximumStock:  { type: Number, default: 9999, min: 0 },

  // Descriptions
  shortDescription: { type: String, trim: true, maxlength: 200, default: '' },
  longDescription:  { type: String, trim: true, maxlength: 2000, default: '' },

  // Multiple images
  productImages: [productImageSchema],

  // Status
  status:    { type: String, enum: ['active', 'inactive', 'out_of_stock'], default: 'active' },
  isLowStock: { type: Boolean, default: false }
}, { timestamps: true });

// Auto-generate IDs
productSchema.pre('save', async function (next) {
  if (!this.productId) {
    const count = await mongoose.model('Product').countDocuments();
    this.productId = `PRD${String(count + 1).padStart(5, '0')}`;
  }
  if (!this.productCode) {
    const count = await mongoose.model('Product').countDocuments();
    this.productCode = `PC${String(count + 1).padStart(5, '0')}`;
  }
  // Ensure exactly one primary image
  if (this.productImages?.length > 0 && !this.productImages.some(i => i.isPrimary)) {
    this.productImages[0].isPrimary = true;
  }
  // Low stock check
  this.isLowStock = this.currentStock <= this.reorderLevel;
  if (this.currentStock === 0) this.status = 'out_of_stock';
  next();
});

// Virtual: primary image URL
productSchema.virtual('primaryImage').get(function () {
  const primary = this.productImages?.find(i => i.isPrimary);
  return primary?.url || this.productImages?.[0]?.url || null;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

productSchema.index({ category: 1, productType: 1 });
productSchema.index({ status: 1 });
productSchema.index({ isLowStock: 1 });

module.exports = mongoose.model('Product', productSchema);
