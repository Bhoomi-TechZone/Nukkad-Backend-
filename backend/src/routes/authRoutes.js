const router = require('express').Router();
const ctrl = require('../controllers/AuthController');
const { protect } = require('../middlewares/auth');

router.post('/send-otp', ctrl.sendOtp);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.get('/me', protect, ctrl.me);

module.exports = router;