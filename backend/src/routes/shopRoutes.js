const router = require('express').Router();
const ctrl = require('../controllers/shopController');
const { protect } = require('../middlewares/auth');

router.use(protect);

router.get('/', ctrl.getShops);
router.get('/:id', ctrl.getShop);

module.exports = router;