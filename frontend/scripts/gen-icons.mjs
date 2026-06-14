// Gera PNGs a partir dos SVGs em public/ — rodar quando o ícone mudar.
// `npm run icons` (script no package.json).
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')

const sources = [
  { src: 'icon-192.svg', out: 'icon-192.png', size: 192 },
  { src: 'icon-512.svg', out: 'icon-512.png', size: 512 },
  { src: 'icon-512.svg', out: 'icon-maskable-512.png', size: 512, padding: 0.1 },
]

for (const { src, out, size, padding = 0 } of sources) {
  const svgPath = join(publicDir, src)
  const outPath = join(publicDir, out)
  const svgBuf = readFileSync(svgPath)

  if (padding > 0) {
    // safe-zone para ícone maskable (~10% de margem).
    const inner = Math.round(size * (1 - padding * 2))
    const offset = Math.round((size - inner) / 2)
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 31, g: 41, b: 55, alpha: 1 }, // #1f2937
      },
    })
      .composite([{ input: await sharp(svgBuf).resize(inner, inner).png().toBuffer(), top: offset, left: offset }])
      .png()
      .toFile(outPath)
  } else {
    await sharp(svgBuf).resize(size, size).png().toFile(outPath)
  }
  console.log(`wrote ${out} (${size}x${size}${padding ? `, padded ${padding}` : ''})`)
}
