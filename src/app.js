const express = require('express');
const helmet = require('helmet');
const authRoutes = require('./routes/auth.routes');
const inventarioRoutes = require('./routes/inventario.routes');
const { errorHandler, noEncontrado } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.json({ limit: '20kb' }));

app.get('/health', (_req, res) => res.json({ estado: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api', inventarioRoutes);

app.use(noEncontrado);
app.use(errorHandler);

module.exports = app;
