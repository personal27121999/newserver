const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  categoryCode: { type: String, unique: true },
  name: { type: String, required: [true, 'Category name is required'], trim: true, unique: true },
  description: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

categorySchema.pre('save', async function (next) {
  if (!this.categoryCode) {
    const count = await mongoose.model('Category').countDocuments();
    this.categoryCode = `CAT${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

categorySchema.index({ name: 'text' });
module.exports = mongoose.model('Category', categorySchema);
