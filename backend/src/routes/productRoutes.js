const router = require('express').Router();
const ctrl = require('../controllers/productController');
const { protect, authorize } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.use(protect);

router
  .route('/')
  .post(authorize('shopkeeper'), upload.single('image'), ctrl.createProduct)
  .get(ctrl.getProducts);

router
  .route('/:id')
  .get(ctrl.getProduct)
  .put(authorize('shopkeeper', 'admin'), upload.single('image'), ctrl.updateProduct)
  .delete(authorize('shopkeeper', 'admin'), ctrl.deleteProduct);

module.exports = router;