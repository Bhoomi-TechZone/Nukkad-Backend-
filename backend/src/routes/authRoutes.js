const router = require('express').Router();
const ctrl = require('../controllers/AuthController');
const { protect } = require('../middlewares/auth');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.get('/me', protect, ctrl.me);

module.exports = router;