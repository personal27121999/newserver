const express = require('express');
const router = express.Router();
const { getShopProducts, getShopProduct, getShopCategories, placeOrder, getMyOrders, trackOrder, cancelOrder } = require('../controllers/customerShopController');
const { protectCustomer } = require('../middleware/authMiddleware');

// Public
router.get('/categories', getShopCategories);
router.get('/products', getShopProducts);
router.get('/products/:id', getShopProduct);

// Protected (customer must be logged in)
router.post('/orders', protectCustomer, placeOrder);
router.get('/my-orders', protectCustomer, getMyOrders);
router.get('/orders/:id', protectCustomer, trackOrder);
router.put('/orders/:id/cancel', protectCustomer, cancelOrder);

module.exports = router;
