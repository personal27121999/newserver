const express = require('express');
const router = express.Router();
const { sendOTP, verifyOTP, getCustomerProfile, updateCustomerProfile, addAddress, deleteAddress } = require('../controllers/customerAuthController');
const { protectCustomer } = require('../middleware/authMiddleware');

router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.get('/profile', protectCustomer, getCustomerProfile);
router.put('/profile', protectCustomer, updateCustomerProfile);
router.post('/address', protectCustomer, addAddress);
router.delete('/address/:addressId', protectCustomer, deleteAddress);

module.exports = router;
