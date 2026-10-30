/**
 * generate_icons.js
 * Generates production-ready PNG icons for "X-Ray: Subtext Decoder for X"
 * Sizes: 16x16, 48x48, 128x128.
 *
 * Runs in pure Node.js (v14+) without any external dependencies using built-in zlib.
 * Can also be executed directly via `node generate_icons.js`.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation for PNG chunks
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crcVal = crc32(typeAndData);
  chunk.writeUInt32BE(crcVal, 8 + len);
  return chunk;
}

function encodePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth: 8
  ihdrData[9] = 6; // color type: 6 (RGBA)
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method
  const ihdrChunk = createPngChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0 (None)
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  let scanlineOffset = 0;
  let rgbaOffset = 0;

  for (let y = 0; y < height; y++) {
    scanlines[scanlineOffset++] = 0; // Filter: None
    rgbaBuffer.copy(scanlines, scanlineOffset, rgbaOffset, rgbaOffset + width * 4);
    scanlineOffset += width * 4;
    rgbaOffset += width * 4;
  }

  // IDAT
  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = createPngChunk('IDAT', compressed);

  // IEND
  const iendChunk = createPngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Draws an X-Ray themed icon onto an RGBA buffer.
 * Aesthetics:
 * - Deep dark slate-black rounded badge
 * - Glowing electric cyan/teal X-Ray fluoroscopy border
 * - Stylized bones/laser 'X' in glowing cyan (#00f2fe) with bright white core
 * - Subtle medical scanline effect
 */
function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 4);

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    const bgA = buf[idx + 3] / 255;
    const fgA = a / 255;
    const outA = fgA + bgA * (1 - fgA);

    if (outA > 0) {
      const outR = Math.round((r * fgA + buf[idx] * bgA * (1 - fgA)) / outA);
      const outG = Math.round((g * fgA + buf[idx + 1] * bgA * (1 - fgA)) / outA);
      const outB = Math.round((b * fgA + buf[idx + 2] * bgA * (1 - fgA)) / outA);
      buf[idx] = Math.min(255, Math.max(0, outR));
      buf[idx + 1] = Math.min(255, Math.max(0, outG));
      buf[idx + 2] = Math.min(255, Math.max(0, outB));
      buf[idx + 3] = Math.min(255, Math.max(0, Math.round(outA * 255)));
    }
  }

  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const maxR = size * 0.46;
  const cornerRadius = size * 0.22;

  // 1. Draw rounded squircle / badge background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded rect distance metric
      const dx = Math.max(0, Math.abs(x - cx) - (cx - cornerRadius));
      const dy = Math.max(0, Math.abs(y - cy) - (cy - cornerRadius));
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= cornerRadius + 0.5) {
        const edgeAlpha = Math.min(1, Math.max(0, (cornerRadius + 0.5 - dist) * 1.5));
        // Deep background gradient (top-left dark to bottom-right deep obsidian)
        const grad = (x + y) / (size * 2);
        const bgR = Math.round(10 + grad * 8);
        const bgG = Math.round(15 + grad * 12);
        const bgB = Math.round(24 + grad * 20);

        setPixel(x, y, bgR, bgG, bgB, Math.round(edgeAlpha * 255));

        // Subtle border glow
        if (dist >= cornerRadius - 1.5) {
          const borderIntensity = 1 - Math.abs(dist - (cornerRadius - 0.5));
          if (borderIntensity > 0) {
            setPixel(x, y, 0, 242, 254, Math.round(borderIntensity * 180 * edgeAlpha));
          }
        }
      }
    }
  }

  // 2. Draw stylized X-Ray 'X'
  // Distance from point to line segment
  function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  const armLen = size * 0.28;
  const p1x = cx - armLen, p1y = cy - armLen;
  const p2x = cx + armLen, p2y = cy + armLen;
  const p3x = cx + armLen, p3y = cy - armLen;
  const p4x = cx - armLen, p4y = cy + armLen;

  const strokeWidth = Math.max(1.8, size * 0.09);
  const glowRadius = Math.max(3.5, size * 0.18);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d1 = distToSegment(x, y, p1x, p1y, p2x, p2y);
      const d2 = distToSegment(x, y, p3x, p3y, p4x, p4y);
      const minD = Math.min(d1, d2);

      // Outer cyan aura glow
      if (minD < glowRadius) {
        const aura = Math.exp(-((minD / glowRadius) ** 2) * 2.5);
        setPixel(x, y, 0, 242, 254, Math.round(aura * 140));
      }

      // Main core stroke
      if (minD <= strokeWidth + 0.8) {
        const coreAlpha = Math.min(1, Math.max(0, (strokeWidth + 0.8 - minD) * 1.5));
        // Center white core, outer cyan
        const t = Math.min(1, minD / strokeWidth);
        const r = Math.round(255 * (1 - t * 0.8));
        const g = Math.round(255 * (1 - t * 0.2) + 242 * (t * 0.2));
        const b = 254;
        setPixel(x, y, r, g, b, Math.round(coreAlpha * 255));
      }
    }
  }

  // 3. Subtle horizontal X-Ray scan line across center
  if (size >= 32) {
    const scanY = Math.round(cy);
    for (let x = Math.round(cx - armLen * 1.3); x <= Math.round(cx + armLen * 1.3); x++) {
      setPixel(x, scanY, 0, 242, 254, 75);
    }
  }

  return buf;
}

// Generate all required icon sizes
const SIZES = [16, 48, 128];
const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

console.log('⚡ Generating X-Ray Chrome Extension icons...');

for (const size of SIZES) {
  const rgbaBuffer = renderIcon(size);
  const pngBuffer = encodePng(size, size, rgbaBuffer);
  const filename = `icon${size}.png`;
  const outPath = path.join(iconsDir, filename);
  fs.writeFileSync(outPath, pngBuffer);
  console.log(`✓ Generated: ${filename} (${size}x${size}px, ${pngBuffer.length} bytes)`);
}

console.log('✅ All icons successfully created in icons/ directory!');
