const router = require('express').Router();
const ctrl = require('../controllers/categoryController');
const { protect, authorize } = require('../middlewares/auth');

router.use(protect);

router
  .route('/')
  .post(authorize('admin'), ctrl.createCategory)
  .get(ctrl.getCategories);

router
  .route('/:id')
  .get(ctrl.getCategory)
  .put(authorize('admin'), ctrl.updateCategory)
  .delete(authorize('admin'), ctrl.deleteCategory);

module.exports = router;