// Rasterises the brand mark to PNG for the touch icon and the legacy favicon.
//
// The mark is three rounded rectangles on a rounded square, so rasterising it
// directly is far lighter than pulling in a full SVG renderer. Coverage is
// supersampled 4x4 per pixel for clean edges.

import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const hex = (value) => [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16))

// Geometry in the mark's own 48x48 coordinate space.
const canvasSize = 48
const shapes = [
  { x: 0, y: 0, w: 48, h: 48, r: 11, fill: hex('#FBF7F0') },
  { x: 15, y: 9, w: 18, h: 8, r: 4, fill: hex('#EBD9AE') },
  { x: 11, y: 20, w: 26, h: 8, r: 4, fill: hex('#6E964A') },
  { x: 7, y: 31, w: 34, h: 8, r: 4, fill: hex('#5B3E96') },
]

function insideRoundedRect(px, py, { x, y, w, h, r }) {
  if (px < x || py < y || px > x + w || py > y + h) return false
  const dx = Math.max(x + r - px, 0, px - (x + w - r))
  const dy = Math.max(y + r - py, 0, py - (y + h - r))
  return dx * dx + dy * dy <= r * r
}

function render(size) {
  const samples = 4
  const pixels = Buffer.alloc(size * size * 3)
  const scale = canvasSize / size

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let red = 0
      let green = 0
      let blue = 0
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = (column + (sx + 0.5) / samples) * scale
          const py = (row + (sy + 0.5) / samples) * scale
          // Later shapes paint over earlier ones.
          let colour = [251, 247, 240]
          for (const shape of shapes) if (insideRoundedRect(px, py, shape)) colour = shape.fill
          red += colour[0]; green += colour[1]; blue += colour[2]
        }
      }
      const total = samples * samples
      const offset = (row * size + column) * 3
      pixels[offset] = Math.round(red / total)
      pixels[offset + 1] = Math.round(green / total)
      pixels[offset + 2] = Math.round(blue / total)
    }
  }
  return pixels
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function toPng(size) {
  const pixels = render(size)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8   // bit depth
  header[9] = 2   // truecolour
  const stride = size * 3
  const raw = Buffer.alloc((stride + 1) * size)
  for (let row = 0; row < size; row += 1) {
    raw[row * (stride + 1)] = 0 // no per-scanline filter
    pixels.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// 192 and 512 are what a web app manifest is expected to offer: Android uses
// the first for the home screen and the second for the splash screen.
for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  const path = resolve('public', name)
  await mkdir(dirname(path), { recursive: true })
  const png = toPng(size)
  await writeFile(path, png)
  console.log(`${name} · ${size}x${size} · ${(png.length / 1024).toFixed(1)} kB`)
}
