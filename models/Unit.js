const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
  unitCode: { type: String, unique: true },
  name: { type: String, required: [true, 'Unit name is required'], trim: true, unique: true },
  description: { type: String, trim: true, default: '' },
  unitGroup: { type: String, enum: ['countable', 'weight'], default: 'countable' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

unitSchema.pre('save', async function (next) {
  if (!this.unitCode) {
    const count = await mongoose.model('Unit').countDocuments();
    this.unitCode = `UNT${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Unit', unitSchema);
