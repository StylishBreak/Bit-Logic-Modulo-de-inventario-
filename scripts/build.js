// Build: verifica la sintaxis de todos los archivos y genera la carpeta dist/ lista para desplegar.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const dist = path.join(raiz, 'dist');
fs.rmSync(dist, { recursive: true, force: true });

const archivos = [];
(function recorrer(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) recorrer(p); else if (p.endsWith('.js')) archivos.push(p);
  }
})(path.join(raiz, 'src'));

archivos.forEach((f) => execFileSync(process.execPath, ['--check', f]));
fs.cpSync(path.join(raiz, 'src'), path.join(dist, 'src'), { recursive: true });
['package.json', 'package-lock.json'].forEach((f) => fs.copyFileSync(path.join(raiz, f), path.join(dist, f)));
console.log(`Build correcto: ${archivos.length} archivos verificados y copiados a dist/`);
