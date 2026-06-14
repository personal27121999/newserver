const express = require('express');
const router = express.Router();
const { updateStock, getLowStockProducts } = require('../controllers/inventoryController');
const { protect } = require('../middleware/authMiddleware');
router.use(protect);
router.get('/low-stock', getLowStockProducts);
router.put('/update-stock', updateStock);
module.exports = router;
