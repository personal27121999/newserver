const express = require('express');
const router = express.Router();
const {
  adminLogin, getAdminProfile, updateAdminProfile, changePassword,
  deliveryLogin, getDeliveryProfile
} = require('../controllers/authController');
const { protect, protectDelivery } = require('../middleware/authMiddleware');

// Admin
router.post('/admin/login', adminLogin);
router.get('/admin/profile', protect, getAdminProfile);
router.put('/admin/profile', protect, updateAdminProfile);
router.put('/admin/change-password', protect, changePassword);

// Delivery Boy
router.post('/delivery/login', deliveryLogin);
router.get('/delivery/profile', protectDelivery, getDeliveryProfile);

module.exports = router;
