const Order   = require('../models/Order');
const Bill    = require('../models/Bill');
const Product = require('../models/Product');
const Customer= require('../models/Customer');
const DeliveryBoy = require('../models/DeliveryBoy');

const getDashboardStats = async (req, res) => {
  try {
    const now         = new Date();
    const startOfDay  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth= new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalProducts, totalOrders, pendingOrders, deliveredOrders,
      cancelledOrders, totalCustomers, totalDeliveryBoys, lowStockProducts,
      // Order revenue (online/delivery orders)
      orderDailyRev, orderMonthlyRev,
      // Billing revenue (counter sales)
      billDailyRev, billMonthlyRev,
      // Total bills today
      totalBillsToday,
      recentOrders, recentBills, ordersByStatus
    ] = await Promise.all([
      Product.countDocuments({ status: { $ne: 'out_of_stock' } }),
      Order.countDocuments(),
      Order.countDocuments({ orderStatus: 'pending' }),
      Order.countDocuments({ orderStatus: 'delivered' }),
      Order.countDocuments({ orderStatus: 'cancelled' }),
      Customer.countDocuments({ isActive: true }),
      DeliveryBoy.countDocuments({ isActive: true }),
      Product.countDocuments({ isLowStock: true }),

      // Order revenue (delivered + paid)
      Order.aggregate([
        { $match: { createdAt: { $gte: startOfDay }, paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: startOfMonth }, paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),

      // Bill revenue (counter sales) — sum actual amountPaid (covers partial payments too)
      Bill.aggregate([
        { $match: { createdAt: { $gte: startOfDay } } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } }
      ]),
      Bill.aggregate([
        { $match: { createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } }
      ]),

      Bill.countDocuments({ createdAt: { $gte: startOfDay } }),

      Order.find().sort({ createdAt: -1 }).limit(5).populate('assignedDeliveryBoy','name'),
      Bill.find().sort({ createdAt: -1 }).limit(5),
      Order.aggregate([{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }])
    ]);

    // Weekly revenue (orders + bills combined) for chart
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return {
        date:  d.toISOString().split('T')[0],
        start: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        end:   new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
      };
    });

    const weeklyRevenue = await Promise.all(
      last7Days.map(async (day) => {
        const [oRes, bRes] = await Promise.all([
          Order.aggregate([
            { $match: { createdAt: { $gte: day.start, $lte: day.end }, orderStatus: 'delivered' } },
            { $group: { _id: null, total: { $sum: '$totalAmount' }, orders: { $sum: 1 } } }
          ]),
          Bill.aggregate([
            { $match: { createdAt: { $gte: day.start, $lte: day.end } } },
            { $group: { _id: null, total: { $sum: '$amountPaid' }, bills: { $sum: 1 } } }
          ])
        ]);
        return {
          date:          day.date,
          orderRevenue:  oRes[0]?.total  || 0,
          billRevenue:   bRes[0]?.total  || 0,
          revenue:       (oRes[0]?.total || 0) + (bRes[0]?.total || 0),
          orders:        oRes[0]?.orders || 0,
          bills:         bRes[0]?.bills  || 0
        };
      })
    );

    // Low stock list
    const lowStockList = await Product.find({ isLowStock: true })
      .select('name category productType productImages currentStock reorderLevel unit status')
      .populate('category','name').populate('productType','name').populate('unit','name')
      .sort({ currentStock: 1 }).limit(10);

    // Combined daily + monthly revenue
    const dailyRevenue   = (orderDailyRev[0]?.total   || 0) + (billDailyRev[0]?.total   || 0);
    const monthlyRevenue = (orderMonthlyRev[0]?.total  || 0) + (billMonthlyRev[0]?.total  || 0);

    res.json({
      success: true,
      data: {
        stats: {
          totalProducts, totalOrders, pendingOrders, deliveredOrders, cancelledOrders,
          totalCustomers, totalDeliveryBoys, lowStockProducts,
          dailyRevenue, monthlyRevenue,
          // Billing-specific
          orderDailyRevenue:  orderDailyRev[0]?.total  || 0,
          billDailyRevenue:   billDailyRev[0]?.total   || 0,
          totalBillsToday
        },
        weeklyRevenue,
        recentOrders,
        recentBills,
        lowStockList,
        ordersByStatus: ordersByStatus.reduce((acc, i) => { acc[i._id] = i.count; return acc; }, {})
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getDashboardStats };
