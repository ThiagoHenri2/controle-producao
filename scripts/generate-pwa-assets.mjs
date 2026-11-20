// Gera os ícones do PWA em public/ a partir de um SVG simples:
// fundo laranja (primary #C2410C) + ícone "Truck" do lucide em branco
// (a mesma identidade da tela de login).
//
// Uso: npm run generate-pwa-assets
// Os PNGs gerados são versionados; só rode de novo se mudar a identidade visual.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PRIMARY = '#C2410C';
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

// Ícone lucide "truck" (viewBox 24x24, traço 2, pontas arredondadas).
const TRUCK = `
  <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
  <path d="M15 18H9"/>
  <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
  <circle cx="17" cy="18" r="2"/>
  <circle cx="7" cy="18" r="2"/>`;

/**
 * @param {number} size     lado do quadrado em px
 * @param {number} iconFrac fração do lado ocupada pelo ícone (24 unidades)
 * @param {number} radius   raio dos cantos do fundo (0 = quadrado cheio)
 */
function svg(size, iconFrac, radius) {
  const scale = (size * iconFrac) / 24;
  const offset = (size - 24 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${PRIMARY}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TRUCK}
  </g>
</svg>
`;
}

const targets = [
  // "any": cantos arredondados, ícone ocupando ~62% do quadrado.
  { file: 'pwa-192.png', size: 192, iconFrac: 0.62, radius: 192 * 0.2 },
  { file: 'pwa-512.png', size: 512, iconFrac: 0.62, radius: 512 * 0.2 },
  // "maskable": fundo cheio; o ícone fica dentro da safe zone (círculo de 80%).
  { file: 'maskable-512.png', size: 512, iconFrac: 0.5, radius: 0 },
  // iOS arredonda sozinho e não aceita transparência: fundo cheio.
  { file: 'apple-touch-icon.png', size: 180, iconFrac: 0.6, radius: 0 },
];

for (const t of targets) {
  await sharp(Buffer.from(svg(t.size, t.iconFrac, t.radius)))
    .png({ compressionLevel: 9 })
    .toFile(publicDir + t.file);
  console.log('gerado public/' + t.file);
}

await writeFile(publicDir + 'favicon.svg', svg(64, 0.7, 14));
console.log('gerado public/favicon.svg');
