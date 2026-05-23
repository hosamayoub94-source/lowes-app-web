/**
 * Generates PWA icons as PNGs using pure Node.js (no canvas dependency).
 * Creates minimal valid PNGs with the app logo embedded.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/** Write a minimal valid PNG with a solid color background + centered "L" letter */
function makePNG(size) {
  const width = size;
  const height = size;

  // Navy background: #0f1f3d  = r:15 g:31 b:61
  // Teal accent:    #0d7377  = r:13 g:115 b:119
  // White:          #ffffff  = r:255 g:255 b:255

  const navy = [15, 31, 61];
  const teal = [13, 115, 119];
  const white = [255, 255, 255];

  // Build RGBA pixel array
  const pixels = new Uint8Array(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const r = width * 0.42;          // outer circle radius
  const innerR = width * 0.32;     // inner for letter bounding box

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Corner rounding — transparent corners to act as maskable
      const cornerDist = Math.sqrt(Math.pow(Math.abs(dx) - cx * 0.7, 2) + Math.pow(Math.abs(dy) - cy * 0.7, 2));

      let color;
      if (dist < r) {
        // Inside circle — teal ring + navy fill
        if (dist > r - width * 0.06) {
          color = teal;
        } else {
          color = navy;
        }

        // Draw a bold "L" shape (simplified)
        const lx = x - (cx - innerR * 0.25);
        const ly = y - (cy - innerR * 0.38);
        const barW = innerR * 0.25;
        const barH = innerR * 0.75;
        const baseH = innerR * 0.28;
        const baseW = innerR * 0.70;

        const inVertical = lx >= 0 && lx <= barW && ly >= 0 && ly <= barH;
        const inBase     = lx >= 0 && lx <= baseW && ly >= barH - baseH && ly <= barH;

        if (inVertical || inBase) {
          color = white;
        }
      } else {
        // Outside circle — navy background (maskable icon uses full square)
        color = navy;
      }

      pixels[idx]     = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255; // fully opaque
    }
  }

  // Encode as PNG
  return encodePNG(width, height, pixels);
}

function encodePNG(width, height, pixels) {
  const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const buf = Buffer.concat([typeBytes, data]);
    const crc = crc32(buf);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeBytes, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type = RGB (we'll add filter bytes per row instead)
  // Actually let's do RGBA (color type 6)
  ihdr[9] = 6;
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Build raw image data (filter byte 0 = None, per row)
  const rawRows = [];
  for (let y = 0; y < height; y++) {
    rawRows.push(0); // filter type None
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      rawRows.push(pixels[idx], pixels[idx+1], pixels[idx+2], pixels[idx+3]);
    }
  }
  const raw = Buffer.from(rawRows);
  const compressed = zlib.deflateSync(raw, { level: 6 });

  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), idat, iend]);
}

// CRC32 table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Generate icons
const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const png = makePNG(size);
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`✅ Generated ${outPath} (${png.length} bytes)`);
}

console.log('🎉 PWA icons generated successfully!');
