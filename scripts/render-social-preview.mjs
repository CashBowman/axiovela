import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const source = fileURLToPath(new URL('../docs/assets/axiovela-social.svg', import.meta.url));
const output = fileURLToPath(new URL('../docs/assets/axiovela-social.png', import.meta.url));
const mark = await readFile(new URL('../public/workbench-mark.png', import.meta.url));
const svg = (await readFile(source, 'utf8')).replace('../../public/workbench-mark.png', `data:image/png;base64,${mark.toString('base64')}`);
await sharp(Buffer.from(svg)).png().toFile(output);
console.log('Rendered docs/assets/axiovela-social.png (1280 × 640).');
