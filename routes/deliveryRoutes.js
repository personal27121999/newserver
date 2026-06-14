// Delivery Boy PANEL routes (authenticated as delivery boy)
const express = require('express');
const router = express.Router();
const {
  getMyOrders, getMyHistory, getMyOrderDetail,
  respondToOrder, updateDeliveryStatus, getMyStats
} = require('../controllers/deliveryBoyController');
const { protectDelivery } = require('../middleware/authMiddleware');

router.use(protectDelivery);

router.get('/stats', getMyStats);
router.get('/my-orders', getMyOrders);
router.get('/history', getMyHistory);
router.get('/orders/:id', getMyOrderDetail);
router.put('/orders/:id/respond', respondToOrder);
router.put('/orders/:id/status', updateDeliveryStatus);

module.exports = router;
