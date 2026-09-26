const app = require('./app');
const { port } = require('./config');

app.listen(port, () => console.log(`Módulo de inventario escuchando en el puerto ${port}`));
