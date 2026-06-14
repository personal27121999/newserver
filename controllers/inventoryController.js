const Product = require('../models/Product');
const Notification = require('../models/Notification');
const { emitToAdmin } = require('../socket/socketManager');

// PUT /api/inventory/update-stock
const updateStock = async (req, res) => {
  try {
    const { productId, quantity, operation='set' } = req.body;
    const product = await Product.findById(productId).populate('unit','name');
    if (!product) return res.status(404).json({ success:false, message:'Product not found' });

    const prev = product.currentStock;
    const q    = parseFloat(quantity);
    if (operation === 'add')      product.currentStock = prev + q;
    else if (operation === 'subtract') product.currentStock = Math.max(0, prev - q);
    else                          product.currentStock = q;

    product.isLowStock = product.currentStock <= product.reorderLevel;
    if (product.currentStock === 0) product.status = 'out_of_stock';
    else if (product.status === 'out_of_stock') product.status = 'active';

    await product.save({ validateBeforeSave:false });

    emitToAdmin('stock_updated', {
      productId:   product._id,
      productName: product.name,
      prevStock:   prev,
      newStock:    product.currentStock,
      isLowStock:  product.isLowStock
    });

    if (product.isLowStock) {
      const n = await Notification.create({
        type:'low_stock', title:'⚠️ Low Stock Alert',
        message:`${product.name}: ${product.currentStock} ${product.unit?.name} remaining`,
        data:{ productId:product._id, productName:product.name, currentStock:product.currentStock }
      });
      emitToAdmin('low_stock_alert', { notification:n, product });
    }

    res.json({ success:true, message:'Stock updated', data:product });
  } catch(e){ res.status(400).json({ success:false, message:e.message }); }
};

// GET /api/inventory/low-stock
const getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.find({ isLowStock:true })
      .populate('category','name').populate('productType','name').populate('unit','name')
      .sort({ currentStock:1 });
    res.json({ success:true, data:products, count:products.length });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

module.exports = { updateStock, getLowStockProducts };
