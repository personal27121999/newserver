const Product      = require('../models/Product');
const Notification = require('../models/Notification');
const { emitToAdmin } = require('../socket/socketManager');
const fs   = require('fs');
const path = require('path');

// helper: fire low-stock notification
const fireLowStock = async (product) => {
  try {
    const n = await Notification.create({
      type: 'low_stock',
      title: '⚠️ Low Stock Alert',
      message: `${product.name} stock: ${product.currentStock} (reorder at ${product.reorderLevel})`,
      data: { productId: product._id, productName: product.name, currentStock: product.currentStock }
    });
    emitToAdmin('low_stock_alert', { notification: n, product });
  } catch {}
};

// GET /api/products
exports.getProducts = async (req, res) => {
  try {
    const { page=1, limit=20, search, category, productType, unit, status, lowStock, sortBy='createdAt', sortOrder='desc' } = req.query;
    const q = {};
    if (search) {
      q.$or = [
        { name:        { $regex: search, $options: 'i' } },
        { productCode: { $regex: search, $options: 'i' } },
        { barcode:     { $regex: search, $options: 'i' } },
        { shortDescription: { $regex: search, $options: 'i' } }
      ];
    }
    if (category)    q.category    = category;
    if (productType) q.productType = productType;
    if (unit)        q.unit        = unit;
    if (status)      q.status      = status;
    if (lowStock === 'true') q.isLowStock = true;

    const sort  = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    const skip  = (parseInt(page) - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      Product.find(q)
        .populate('category',    'name categoryCode')
        .populate('productType', 'name ptCode')
        .populate('unit',        'name unitCode unitGroup')
        .sort(sort).skip(skip).limit(parseInt(limit)),
      Product.countDocuments(q)
    ]);

    res.json({ success: true, data: products,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total/parseInt(limit)) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /api/products/:id
exports.getProduct = async (req, res) => {
  try {
    const p = await Product.findById(req.params.id)
      .populate('category','name categoryCode')
      .populate('productType','name ptCode')
      .populate('unit','name unitCode unitGroup');
    if (!p) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: p });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /api/products  (multipart — multiple images)
exports.addProduct = async (req, res) => {
  try {
    const d = { ...req.body };
    ['sellingPrice','purchasePrice','discountPrice','currentStock','reorderLevel','minimumStock','maximumStock']
      .forEach(k => { if (d[k] !== undefined) d[k] = parseFloat(d[k]) || 0; });

    // Handle multiple uploaded images
    if (req.files?.length) {
      d.productImages = req.files.map((f, i) => ({
        url: `/uploads/products/${f.filename}`,
        isPrimary: i === 0,
        label: req.body[`imageLabel_${i}`] || ''
      }));
    }

    const product = await Product.create(d);
    emitToAdmin('product_added', { product });
    res.status(201).json({ success: true, message: 'Product added', data: product });
  } catch (e) {
    if (req.files) req.files.forEach(f => fs.unlink(f.path, ()=>{}));
    res.status(400).json({ success: false, message: e.message });
  }
};

// PUT /api/products/:id
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const d = { ...req.body };
    ['sellingPrice','purchasePrice','discountPrice','currentStock','reorderLevel','minimumStock','maximumStock']
      .forEach(k => { if (d[k] !== undefined) d[k] = parseFloat(d[k]) || 0; });

    // Append new uploaded images
    if (req.files?.length) {
      const newImgs = req.files.map((f, i) => ({
        url: `/uploads/products/${f.filename}`,
        isPrimary: false,
        label: req.body[`imageLabel_${i}`] || ''
      }));
      d.productImages = [...(product.productImages || []), ...newImgs];
    }

    // Delete specific images if requested (comma-separated indices)
    if (req.body.removeImageIds) {
      const ids = req.body.removeImageIds.split(',');
      const toRemove = product.productImages.filter(img => ids.includes(img._id.toString()));
      toRemove.forEach(img => {
        const fp = path.join(__dirname, '..', img.url);
        if (fs.existsSync(fp)) fs.unlink(fp, ()=>{});
      });
      d.productImages = (d.productImages || product.productImages).filter(img => !ids.includes(img._id?.toString()));
    }

    // Set primary image
    if (req.body.primaryImageId && d.productImages) {
      d.productImages = d.productImages.map(img => ({
        ...img, isPrimary: img._id?.toString() === req.body.primaryImageId
      }));
    }

    d.isLowStock = (d.currentStock ?? product.currentStock) <= (d.reorderLevel ?? product.reorderLevel);
    if ((d.currentStock ?? product.currentStock) === 0) d.status = 'out_of_stock';
    else if (d.status === 'out_of_stock' && (d.currentStock ?? product.currentStock) > 0) d.status = 'active';

    const updated = await Product.findByIdAndUpdate(req.params.id, d, { new: true, runValidators: true })
      .populate('category','name').populate('productType','name').populate('unit','name unitGroup');

    emitToAdmin('product_updated', { product: updated });
    if (updated.isLowStock) await fireLowStock(updated);

    res.json({ success: true, message: 'Product updated', data: updated });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
};

// DELETE /api/products/:id
exports.deleteProduct = async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false, message: 'Product not found' });
    p.productImages?.forEach(img => {
      const fp = path.join(__dirname, '..', img.url);
      if (fs.existsSync(fp)) fs.unlink(fp, ()=>{});
    });
    await Product.findByIdAndDelete(req.params.id);
    emitToAdmin('product_deleted', { productId: req.params.id });
    res.json({ success: true, message: 'Product deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
