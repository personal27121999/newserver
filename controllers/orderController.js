const Order        = require('../models/Order');
const Product      = require('../models/Product');
const Customer     = require('../models/Customer');
const Notification = require('../models/Notification');
const { emitToAdmin, emitToAll } = require('../socket/socketManager');

// GET /api/orders
const getOrders = async (req, res) => {
  try {
    const { page=1, limit=20, search, orderStatus, paymentStatus, sortBy='createdAt', sortOrder='desc', dateFrom, dateTo } = req.query;
    const q = {};
    if (search) q.$or = [
      { orderId:      { $regex: search, $options:'i' } },
      { customerName: { $regex: search, $options:'i' } },
      { customerPhone:{ $regex: search, $options:'i' } }
    ];
    if (orderStatus)  q.orderStatus  = orderStatus;
    if (paymentStatus) q.paymentStatus = paymentStatus;
    if (dateFrom || dateTo) {
      q.createdAt = {};
      if (dateFrom) q.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   q.createdAt.$lte = new Date(new Date(dateTo).setHours(23,59,59,999));
    }
    const skip = (parseInt(page)-1)*parseInt(limit);
    const [orders, total] = await Promise.all([
      Order.find(q).populate('assignedDeliveryBoy','name phone').sort({ [sortBy]: sortOrder==='asc'?1:-1 }).skip(skip).limit(parseInt(limit)),
      Order.countDocuments(q)
    ]);
    res.json({ success:true, data:orders, pagination:{ page:parseInt(page), limit:parseInt(limit), total, pages:Math.ceil(total/parseInt(limit)) } });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/orders/:id
const getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer','name phone email addresses')
      .populate('assignedDeliveryBoy','name phone vehicleNumber')
      .populate('items.product','name productImages category');
    if (!order) return res.status(404).json({ success:false, message:'Order not found' });
    res.json({ success:true, data:order });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

// PUT /api/orders/:id/status
const updateOrderStatus = async (req, res) => {
  try {
    const { orderStatus, note, paymentStatus } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success:false, message:'Order not found' });
    const upd = {};
    if (orderStatus)  { upd.orderStatus = orderStatus;   upd.$push = { statusHistory:{ status:orderStatus, updatedBy:req.admin.name, note:note||'', timestamp:new Date() } }; }
    if (paymentStatus) upd.paymentStatus = paymentStatus;
    const updated = await Order.findByIdAndUpdate(req.params.id, upd, { new:true });
    emitToAdmin('order_status_updated', { order:updated });
    emitToAll(`order_update_${order._id}`, { orderStatus:updated.orderStatus });
    if (orderStatus==='delivered') {
      await Customer.findByIdAndUpdate(order.customer, { $inc:{ totalOrders:1, totalSpent:order.totalAmount }, lastOrderAt:new Date() });
    }
    res.json({ success:true, message:'Order status updated', data:updated });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

// PUT /api/orders/:id/assign
const assignDeliveryBoy = async (req, res) => {
  try {
    const { deliveryBoyId } = req.body;
    const DeliveryBoy = require('../models/DeliveryBoy');
    const db = await DeliveryBoy.findById(deliveryBoyId);
    if (!db) return res.status(404).json({ success:false, message:'Delivery boy not found' });
    const order = await Order.findByIdAndUpdate(req.params.id, {
      assignedDeliveryBoy: deliveryBoyId, deliveryBoyName: db.name, orderStatus:'accepted',
      $push:{ statusHistory:{ status:'accepted', updatedBy:req.admin.name, note:`Assigned to ${db.name}`, timestamp:new Date() } }
    }, { new:true }).populate('assignedDeliveryBoy','name phone');
    emitToAdmin('order_assigned', { order });
    emitToAll(`delivery_boy_${deliveryBoyId}`, { event:'new_assignment', order });
    res.json({ success:true, message:`Assigned to ${db.name}`, data:order });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

// POST /api/orders  (admin creates manual order)
const createOrder = async (req, res) => {
  try {
    const { customerId, items, deliveryAddress, paymentMethod, notes } = req.body;
    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ success:false, message:'Customer not found' });

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId)
        .populate('unit','name');
      if (!product) return res.status(404).json({ success:false, message:`Product ${item.productId} not found` });
      if (product.currentStock < item.quantity)
        return res.status(400).json({ success:false, message:`Insufficient stock for ${product.name}` });

      const unitPrice   = product.discountPrice || product.sellingPrice;
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;

      const primaryImg = product.productImages?.find(i=>i.isPrimary) || product.productImages?.[0];
      orderItems.push({
        product:      product._id,
        productName:  product.name,
        productImage: primaryImg?.url || null,
        price:        product.sellingPrice,
        discountPrice:product.discountPrice,
        quantity:     item.quantity,
        unit:         product.unit?.name || '',
        subtotal:     itemSubtotal
      });

      product.currentStock -= item.quantity;
      product.isLowStock    = product.currentStock <= product.reorderLevel;
      if (product.currentStock === 0) product.status = 'out_of_stock';
      await product.save({ validateBeforeSave:false });

      if (product.isLowStock) await fireLowStock(product);
    }

    const order = await Order.create({
      customer:customerId, customerName:customer.name, customerPhone:customer.phone,
      items:orderItems, deliveryAddress, paymentMethod:paymentMethod||'cash_on_delivery',
      subtotal, totalAmount:subtotal, notes,
      statusHistory:[{ status:'pending', updatedBy:req.admin.name, note:'Order created by admin' }]
    });

    const notification = await Notification.create({
      type:'new_order', title:'🛒 New Order',
      message:`Order #${order.orderId} from ${customer.name} — ₹${subtotal}`,
      data:{ orderId:order._id, orderNumber:order.orderId }
    });
    emitToAdmin('new_order', { order, notification });
    res.status(201).json({ success:true, message:'Order created', data:order });
  } catch(e){ res.status(400).json({ success:false, message:e.message }); }
};

const fireLowStock = async (product) => {
  try {
    const n = await Notification.create({
      type:'low_stock', title:'⚠️ Low Stock Alert',
      message:`${product.name} stock: ${product.currentStock} (reorder at ${product.reorderLevel})`,
      data:{ productId:product._id, productName:product.name, currentStock:product.currentStock }
    });
    emitToAdmin('low_stock_alert', { notification:n, product });
  } catch {}
};

module.exports = { getOrders, getOrder, updateOrderStatus, assignDeliveryBoy, createOrder };
