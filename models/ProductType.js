const mongoose = require('mongoose');

const productTypeSchema = new mongoose.Schema({
  ptCode: { type: String, unique: true },
  name: { type: String, required: [true, 'Product type name is required'], trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: [true, 'Category is required'] },
  description: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

productTypeSchema.pre('save', async function (next) {
  if (!this.ptCode) {
    const count = await mongoose.model('ProductType').countDocuments();
    this.ptCode = `PT${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

productTypeSchema.index({ name: 'text' });
module.exports = mongoose.model('ProductType', productTypeSchema);
