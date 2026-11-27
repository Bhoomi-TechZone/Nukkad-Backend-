const router = require('express').Router();
const ctrl = require('../controllers/statsController');
const { protect, authorize } = require('../middlewares/auth');

// Only shopkeepers and admins can access stats
router.get('/', protect, authorize('shopkeeper', 'admin'), ctrl.getStats);

module.exports = router;