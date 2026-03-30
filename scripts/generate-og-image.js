// Generate PNG from SVG for social sharing (Facebook, LinkedIn, WhatsApp don't support SVG)
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, '..', 'public', 'og-image-1200x630.svg');
const pngPath = join(__dirname, '..', 'public', 'og-image-1200x630.png');

const svg = readFileSync(svgPath);

await sharp(svg)
  .resize(1200, 630)
  .png({ quality: 90 })
  .toFile(pngPath);

console.log('Generated og-image-1200x630.png');
