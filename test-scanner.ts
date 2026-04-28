import { scanPrototypes, flattenPrototypes } from './src/prototype/server/scanner.js';
import path from 'path';

const prototypesDir = path.join(process.cwd(), '../demo/workspace/prototypes');
console.log('扫描目录:', prototypesDir);
console.log('');

const tree = scanPrototypes(prototypesDir);
console.log('树形结构:');
console.log(JSON.stringify(tree, null, 2));
console.log('');

const paths = flattenPrototypes(tree);
console.log('扁平化路径列表:');
paths.forEach(p => console.log(' -', p));
