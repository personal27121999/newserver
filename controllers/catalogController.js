const Category    = require('../models/Category');
const ProductType = require('../models/ProductType');
const Unit        = require('../models/Unit');

// ── Generic CRUD factory ────────────────────────
// hasCategory: true only for ProductType (which refs Category)
const makeCtrl = (Model, label, hasCategory = false) => ({

  getAll: async (req, res) => {
    try {
      const { search, status, page = 1, limit = 50, category } = req.query;
      const query = {};
      if (search)              query.$or = [{ name: { $regex: search, $options: 'i' } }];
      if (status)              query.status = status;
      if (category && hasCategory) query.category = category;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      let q = Model.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
      if (hasCategory) q = q.populate('category', 'name categoryCode');

      const [items, total] = await Promise.all([q, Model.countDocuments(query)]);

      res.json({
        success: true, data: items,
        pagination: { page: parseInt(page), total, pages: Math.ceil(total / parseInt(limit)) }
      });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  },

  create: async (req, res) => {
    try {
      const item = await Model.create(req.body);
      if (hasCategory) await item.populate('category', 'name categoryCode');
      res.status(201).json({ success: true, message: `${label} created`, data: item });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
  },

  update: async (req, res) => {
    try {
      let q = Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (hasCategory) q = q.populate('category', 'name categoryCode');
      const item = await q;
      if (!item) return res.status(404).json({ success: false, message: `${label} not found` });
      res.json({ success: true, message: `${label} updated`, data: item });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
  },

  remove: async (req, res) => {
    try {
      const item = await Model.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ success: false, message: `${label} not found` });
      res.json({ success: true, message: `${label} deleted` });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  }
});

// Category  — no category ref
// ProductType — HAS category ref (hasCategory = true)
// Unit       — no category ref
const categoryCtrl    = makeCtrl(Category,    'Category',     false);
const productTypeCtrl = makeCtrl(ProductType, 'Product Type', true);
const unitCtrl        = makeCtrl(Unit,        'Unit',         false);

module.exports = { categoryCtrl, productTypeCtrl, unitCtrl };
