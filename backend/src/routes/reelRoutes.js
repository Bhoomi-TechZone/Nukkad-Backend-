const router = require('express').Router();
const ctrl = require('../controllers/reelController');
const { protect, authorize } = require('../middlewares/auth');
const { uploadReel } = require('../middlewares/upload');

router.use(protect);

// Shopkeeper's own reels (must come before /:id)
router.get('/my', authorize('shopkeeper'), ctrl.getMyReels);

router
  .route('/')
  .post(authorize('shopkeeper'), uploadReel.single('video'), ctrl.createReel)
  .get(ctrl.getReels);

router.post('/:id/like', ctrl.toggleLikeReel);

router
  .route('/:id')
  .get(ctrl.getReel)
  .put(authorize('shopkeeper', 'admin'), ctrl.updateReel)
  .delete(authorize('shopkeeper', 'admin'), ctrl.deleteReel);

module.exports = router;

