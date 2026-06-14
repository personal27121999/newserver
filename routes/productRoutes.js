const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/productController');
const { protect } = require('../middleware/authMiddleware');
const upload  = require('../middleware/uploadMiddleware');

router.use(protect);
router.get   ('/',    ctrl.getProducts);
router.post  ('/',    upload.array('images', 5), ctrl.addProduct);
router.get   ('/:id', ctrl.getProduct);
router.put   ('/:id', upload.array('images', 5), ctrl.updateProduct);
router.delete('/:id', ctrl.deleteProduct);

module.exports = router;
