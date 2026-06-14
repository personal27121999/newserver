const DeliveryBoy = require('../models/DeliveryBoy');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const { emitToAdmin, emitToAll } = require('../socket/socketManager');

// ── ADMIN: Manage Delivery Boys ─────────────────

const getDeliveryBoys = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, isAvailable } = req.query;
    const query = { isActive: true };
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
    if (isAvailable !== undefined) query.isAvailable = isAvailable === 'true';
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [deliveryBoys, total] = await Promise.all([
      DeliveryBoy.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      DeliveryBoy.countDocuments(query)
    ]);
    res.json({ success: true, data: deliveryBoys, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addDeliveryBoy = async (req, res) => {
  try {
    const deliveryBoy = await DeliveryBoy.create(req.body);
    res.status(201).json({ success: true, message: 'Delivery boy added successfully', data: deliveryBoy });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateDeliveryBoy = async (req, res) => {
  try {
    const { password, ...updateData } = req.body;
    const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!deliveryBoy) return res.status(404).json({ success: false, message: 'Delivery boy not found' });
    res.json({ success: true, message: 'Delivery boy updated', data: deliveryBoy });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteDeliveryBoy = async (req, res) => {
  try {
    const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!deliveryBoy) return res.status(404).json({ success: false, message: 'Delivery boy not found' });
    res.json({ success: true, message: 'Delivery boy removed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resetDeliveryBoyPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    const deliveryBoy = await DeliveryBoy.findById(req.params.id);
    if (!deliveryBoy) return res.status(404).json({ success: false, message: 'Delivery boy not found' });
    deliveryBoy.password = newPassword;
    await deliveryBoy.save();
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDeliveryBoyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ assignedDeliveryBoy: req.params.id })
      .sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── DELIVERY BOY: Own Panel ─────────────────────

// @desc    Get my assigned orders
// @route   GET /api/delivery/my-orders
const getMyOrders = async (req, res) => {
  try {
    const { status } = req.query;
    const query = { assignedDeliveryBoy: req.deliveryBoy._id };
    if (status) query.orderStatus = status;
    else query.orderStatus = { $in: ['accepted', 'preparing', 'packed', 'out_for_delivery'] };

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .populate('customer', 'name phone addresses');
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get my order history
// @route   GET /api/delivery/history
const getMyHistory = async (req, res) => {
  try {
    const { page = 1, limit = 15 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {
      assignedDeliveryBoy: req.deliveryBoy._id,
      orderStatus: { $in: ['delivered', 'cancelled'] }
    };
    const [orders, total] = await Promise.all([
      Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Order.countDocuments(query)
    ]);
    res.json({ success: true, data: orders, pagination: { page: parseInt(page), total, pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single order detail (delivery boy view)
// @route   GET /api/delivery/orders/:id
const getMyOrderDetail = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      assignedDeliveryBoy: req.deliveryBoy._id
    }).populate('customer', 'name phone addresses');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found or not assigned to you' });
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Accept or reject an order
// @route   PUT /api/delivery/orders/:id/respond
const respondToOrder = async (req, res) => {
  try {
    const { action, reason } = req.body; // action: 'accept' | 'reject'
    const order = await Order.findOne({
      _id: req.params.id,
      assignedDeliveryBoy: req.deliveryBoy._id
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!['pending', 'accepted'].includes(order.orderStatus))
      return res.status(400).json({ success: false, message: 'Cannot respond to this order at current status' });

    if (action === 'accept') {
      order.orderStatus = 'accepted';
    } else if (action === 'reject') {
      order.orderStatus = 'pending';
      order.assignedDeliveryBoy = null;
      order.deliveryBoyName = null;
    }

    order.statusHistory.push({
      status: order.orderStatus,
      updatedBy: req.deliveryBoy.name,
      note: reason || (action === 'accept' ? 'Accepted by delivery boy' : 'Rejected by delivery boy'),
      timestamp: new Date()
    });

    await order.save();
    emitToAdmin('order_status_updated', { order });

    res.json({ success: true, message: `Order ${action}ed successfully`, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update delivery status
// @route   PUT /api/delivery/orders/:id/status
const updateDeliveryStatus = async (req, res) => {
  try {
    const { orderStatus, note } = req.body;
    const ALLOWED = ['accepted', 'out_for_delivery', 'delivered'];
    if (!ALLOWED.includes(orderStatus))
      return res.status(400).json({ success: false, message: `Status must be one of: ${ALLOWED.join(', ')}` });

    const order = await Order.findOne({
      _id: req.params.id,
      assignedDeliveryBoy: req.deliveryBoy._id
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.orderStatus = orderStatus;
    order.statusHistory.push({
      status: orderStatus,
      updatedBy: req.deliveryBoy.name,
      note: note || '',
      timestamp: new Date()
    });

    // On delivery — mark boy as available, increment counter
    if (orderStatus === 'delivered') {
      await DeliveryBoy.findByIdAndUpdate(req.deliveryBoy._id, {
        isAvailable: true,
        currentOrder: null,
        $inc: { totalDeliveries: 1 }
      });

      // Update payment status if COD
      if (order.paymentMethod === 'cash_on_delivery') {
        order.paymentStatus = 'paid';
      }

      // Notify admin
      await Notification.create({
        type: 'delivery_update',
        title: '✅ Order Delivered',
        message: `Order #${order.orderId} delivered by ${req.deliveryBoy.name}`,
        data: { orderId: order._id, orderNumber: order.orderId }
      });
    }

    // On pick-up — mark boy as unavailable
    if (orderStatus === 'out_for_delivery') {
      await DeliveryBoy.findByIdAndUpdate(req.deliveryBoy._id, {
        isAvailable: false,
        currentOrder: order._id
      });
    }

    await order.save();

    emitToAdmin('order_status_updated', { order });
    emitToAll(`order_update_${order._id}`, { orderStatus: order.orderStatus });

    res.json({ success: true, message: 'Status updated successfully', data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get my stats (dashboard)
// @route   GET /api/delivery/stats
const getMyStats = async (req, res) => {
  try {
    const id = req.deliveryBoy._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [activeOrders, todayDeliveries, totalDeliveries, pendingOrders] = await Promise.all([
      Order.countDocuments({ assignedDeliveryBoy: id, orderStatus: { $in: ['accepted', 'out_for_delivery'] } }),
      Order.countDocuments({ assignedDeliveryBoy: id, orderStatus: 'delivered', updatedAt: { $gte: today } }),
      Order.countDocuments({ assignedDeliveryBoy: id, orderStatus: 'delivered' }),
      Order.countDocuments({ assignedDeliveryBoy: id, orderStatus: 'accepted' })
    ]);

    res.json({ success: true, data: { activeOrders, todayDeliveries, totalDeliveries, pendingOrders } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  // Admin functions
  getDeliveryBoys, addDeliveryBoy, updateDeliveryBoy, deleteDeliveryBoy,
  resetDeliveryBoyPassword, getDeliveryBoyOrders,
  // Delivery boy functions
  getMyOrders, getMyHistory, getMyOrderDetail, respondToOrder, updateDeliveryStatus, getMyStats
};
