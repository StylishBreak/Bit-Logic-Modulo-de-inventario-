const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const auth = require('../services/auth.service');

const limiteLogin = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión, intenta más tarde' } });

router.post('/login', limiteLogin, async (req, res, next) => {
  try { res.json(await auth.login(req.body)); } catch (e) { next(e); }
});

module.exports = router;
