const express = require('express');
const router = express.Router();
const { getCustomers, getCustomer, toggleCustomerStatus } = require('../controllers/customerController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.get('/', getCustomers);
router.get('/:id', getCustomer);
router.patch('/:id/toggle-status', toggleCustomerStatus);

module.exports = router;
