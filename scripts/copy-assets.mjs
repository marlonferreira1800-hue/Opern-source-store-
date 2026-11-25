// Copia os assets estáticos (ícones) para dentro do build final (dist/).
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';

mkdirSync(resolve(root, 'dist/assets'), { recursive: true });
cpSync(resolve(root, 'web/assets/icons'), resolve(root, 'dist/assets/icons'), { recursive: true });
console.log('assets copiados para dist/assets/icons');
