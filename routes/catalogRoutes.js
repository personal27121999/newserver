const express = require('express');
const router  = express.Router();
const { categoryCtrl, productTypeCtrl, unitCtrl } = require('../controllers/catalogController');
const { protect } = require('../middleware/authMiddleware');

// ── PUBLIC GET routes (shop reads these without auth) ──
router.get('/categories',          categoryCtrl.getAll);
router.get('/product-types',       productTypeCtrl.getAll);
router.get('/units',               unitCtrl.getAll);

// ── ADMIN only (write operations) ──────────────────────
router.post  ('/categories',          protect, categoryCtrl.create);
router.put   ('/categories/:id',      protect, categoryCtrl.update);
router.delete('/categories/:id',      protect, categoryCtrl.remove);

router.post  ('/product-types',       protect, productTypeCtrl.create);
router.put   ('/product-types/:id',   protect, productTypeCtrl.update);
router.delete('/product-types/:id',   protect, productTypeCtrl.remove);

router.post  ('/units',               protect, unitCtrl.create);
router.put   ('/units/:id',           protect, unitCtrl.update);
router.delete('/units/:id',           protect, unitCtrl.remove);

module.exports = router;
