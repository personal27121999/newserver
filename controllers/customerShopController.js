const Product      = require('../models/Product');
const Order        = require('../models/Order');
const Customer     = require('../models/Customer');
const Notification = require('../models/Notification');
const { emitToAdmin } = require('../socket/socketManager');

// GET /api/shop/products  (public)
const getShopProducts = async (req, res) => {
  try {
    const { page=1, limit=20, search, category, sortBy='name', sortOrder='asc' } = req.query;
    const q = { status:'active' };
    if (search) q.$text = { $search: search };
    if (category) q.category = category;
    const skip = (parseInt(page)-1)*parseInt(limit);
    const [products, total] = await Promise.all([
      Product.find(q)
        .select('name category productType productImages shortDescription sellingPrice discountPrice unit currentStock status')
        .populate('category','name')
        .populate('productType','name')
        .populate('unit','name unitGroup')
        .sort({ [sortBy]: sortOrder==='asc'?1:-1 })
        .skip(skip).limit(parseInt(limit)),
      Product.countDocuments(q)
    ]);
    res.json({ success:true, data:products, pagination:{ page:parseInt(page), limit:parseInt(limit), total, pages:Math.ceil(total/parseInt(limit)) } });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/shop/products/:id  (public)
const getShopProduct = async (req, res) => {
  try {
    const p = await Product.findOne({ _id:req.params.id, status:'active' })
      .select('-isLowStock -reorderLevel -minimumStock -maximumStock -purchasePrice -productId')
      .populate('category','name').populate('productType','name').populate('unit','name unitGroup');
    if (!p) return res.status(404).json({ success:false, message:'Product not found' });
    res.json({ success:true, data:p });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/shop/categories  (public)
const getShopCategories = async (req, res) => {
  try {
    const cats = await Product.aggregate([
      { $match:{ status:'active' } },
      { $group:{ _id:'$category', count:{ $sum:1 } } },
      { $sort:{ count:-1 } }
    ]);
    // Populate category names
    const Category = require('../models/Category');
    const catIds   = cats.map(c => c._id);
    const catDocs  = await Category.find({ _id:{ $in:catIds } }).select('name categoryCode');
    const catMap   = {};
    catDocs.forEach(c => { catMap[c._id.toString()] = c; });
    const result = cats.map(c => ({ ...catMap[c._id?.toString()], count:c.count })).filter(c => c.name);
    res.json({ success:true, data:result });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

// POST /api/shop/orders  (protected)
const placeOrder = async (req, res) => {
  try {
    const { items, deliveryAddress, paymentMethod='cash_on_delivery', deliveryInstructions, preferredDeliveryTime } = req.body;
    const customerId = req.customer._id;

    if (!items?.length)
      return res.status(400).json({ success:false, message:'Order must have at least one item' });
    if (!deliveryAddress?.address || !deliveryAddress?.buildingName)
      return res.status(400).json({ success:false, message:'Delivery address and building name are required' });

    const customer = await Customer.findById(customerId);
    let subtotal   = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId).populate('unit','name');
      if (!product)               return res.status(404).json({ success:false, message:`Product not found: ${item.productId}` });
      if (product.status !== 'active') return res.status(400).json({ success:false, message:`${product.name} is not available` });
      if (product.currentStock < item.quantity)
        return res.status(400).json({ success:false, message:`Insufficient stock for ${product.name}. Available: ${product.currentStock} ${product.unit?.name}` });

      const unitPrice    = product.discountPrice || product.sellingPrice;
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;

      const primaryImg = product.productImages?.find(i=>i.isPrimary) || product.productImages?.[0];
      orderItems.push({
        product:       product._id,
        productName:   product.name,
        productImage:  primaryImg?.url || null,
        price:         product.sellingPrice,
        discountPrice: product.discountPrice,
        quantity:      item.quantity,
        unit:          product.unit?.name || '',
        subtotal:      itemSubtotal
      });

      product.currentStock -= item.quantity;
      product.isLowStock    = product.currentStock <= product.reorderLevel;
      if (product.currentStock === 0) product.status = 'out_of_stock';
      await product.save({ validateBeforeSave:false });

      if (product.isLowStock) {
        const n = await Notification.create({
          type:'low_stock', title:'⚠️ Low Stock Alert',
          message:`${product.name} stock: ${product.currentStock}`,
          data:{ productId:product._id, productName:product.name, currentStock:product.currentStock }
        });
        emitToAdmin('low_stock_alert', { notification:n, product });
      }
    }

    const deliveryCharge = subtotal >= 500 ? 0 : 30;
    const totalAmount    = subtotal + deliveryCharge;

    const order = await Order.create({
      customer:customerId, customerName:customer.name, customerPhone:customer.phone,
      items:orderItems, deliveryAddress, deliveryInstructions, preferredDeliveryTime,
      paymentMethod, subtotal, deliveryCharge, totalAmount,
      orderStatus:'pending',
      statusHistory:[{ status:'pending', updatedBy:customer.name, note:'Order placed by customer', timestamp:new Date() }]
    });

    const notification = await Notification.create({
      type:'new_order', title:'🛒 New Order',
      message:`Order #${order.orderId} from ${customer.name} — ₹${totalAmount}`,
      data:{ orderId:order._id, orderNumber:order.orderId }
    });
    emitToAdmin('new_order', { order, notification });

    res.status(201).json({ success:true, message:'Order placed successfully!', data:order });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/shop/my-orders
const getMyOrders = async (req, res) => {
  try {
    const { page=1, limit=10 } = req.query;
    const skip = (parseInt(page)-1)*parseInt(limit);
    const [orders, total] = await Promise.all([
      Order.find({ customer:req.customer._id }).sort({ createdAt:-1 }).skip(skip).limit(parseInt(limit)).populate('assignedDeliveryBoy','name phone'),
      Order.countDocuments({ customer:req.customer._id })
    ]);
    res.json({ success:true, data:orders, pagination:{ page:parseInt(page), total, pages:Math.ceil(total/parseInt(limit)) } });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/shop/orders/:id
const trackOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id:req.params.id, customer:req.customer._id })
      .populate('assignedDeliveryBoy','name phone vehicleType vehicleNumber');
    if (!order) return res.status(404).json({ success:false, message:'Order not found' });
    res.json({ success:true, data:order });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

// PUT /api/shop/orders/:id/cancel
const cancelOrder = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findOne({ _id:req.params.id, customer:req.customer._id });
    if (!order) return res.status(404).json({ success:false, message:'Order not found' });
    if (!['pending','accepted'].includes(order.orderStatus))
      return res.status(400).json({ success:false, message:'Cannot cancel at this stage' });

    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc:{ currentStock:item.quantity }, status:'active', isLowStock:false
      });
    }
    order.orderStatus        = 'cancelled';
    order.cancellationReason = reason || 'Cancelled by customer';
    order.statusHistory.push({ status:'cancelled', updatedBy:req.customer.name, note:reason||'Cancelled by customer', timestamp:new Date() });
    await order.save();
    emitToAdmin('order_status_updated', { order });
    res.json({ success:true, message:'Order cancelled', data:order });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

module.exports = { getShopProducts, getShopProduct, getShopCategories, placeOrder, getMyOrders, trackOrder, cancelOrder };
