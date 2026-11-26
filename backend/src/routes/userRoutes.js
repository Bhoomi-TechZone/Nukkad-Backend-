const router = require('express').Router();
const ctrl = require('../controllers/userController');
const { protect } = require('../middlewares/auth');

router.use(protect);

router.get('/:id', ctrl.getUser);
router.put('/:id', ctrl.updateUser);

module.exports = router;