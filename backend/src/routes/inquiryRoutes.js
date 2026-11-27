const router = require('express').Router();
const ctrl = require('../controllers/inquiryController');
const { protect, authorize } = require('../middlewares/auth');

router.use(protect);

router
  .route('/')
  .post(authorize('consumer'), ctrl.createInquiry)
  .get(ctrl.getInquiries);

router
  .route('/:id/status')
  .put(authorize('shopkeeper', 'admin'), ctrl.updateInquiryStatus);

module.exports = router;