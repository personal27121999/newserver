// server/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const { getOrders, getOrder, updateOrderStatus, assignDeliveryBoy, createOrder } = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');
router.use(protect);
router.get('/', getOrders);
router.post('/', createOrder);
router.get('/:id', getOrder);
router.put('/:id/status', updateOrderStatus);
router.put('/:id/assign', assignDeliveryBoy);
module.exports = router;
