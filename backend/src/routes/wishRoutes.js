const router = require('express').Router();
const ctrl = require('../controllers/wishController');
const { protect, authorize } = require('../middlewares/auth');

router.use(protect);
router.use(authorize('consumer')); // Only consumers can have wishlists

router.route('/')
    .get(ctrl.getWishlist);

router.post('/sync', ctrl.syncWishlist);

router.route('/:productId')
    .post(ctrl.addToWishlist)
    .delete(ctrl.removeFromWishlist);

module.exports = router;