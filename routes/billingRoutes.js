const express = require('express');
const router  = express.Router();
const { getBills, getBill, createBill, updatePayment, voidBill, getBillingStats } = require('../controllers/billingController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.get  ('/stats',          getBillingStats);
router.get  ('/',               getBills);
router.post ('/',               createBill);
router.get  ('/:id',            getBill);
router.patch('/:id/payment',    updatePayment);
router.delete('/:id',           voidBill);

module.exports = router;
