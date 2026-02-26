/**
 * Generate a proper favicon.ico from the Crazy Chrono branded PNG.
 * ICO format: header + entries + PNG data for 16x16, 32x32, 48x48 sizes.
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const LOGO_SRC = path.join(__dirname, '..', 'public', 'images', 'logo_crazy_chrono.png');
const OUTPUT = path.join(__dirname, '..', 'public', 'favicon.ico');

async function createIconPNG(size) {
  // Create yellow gradient background with rounded corners
  const roundedRect = Buffer.from(
    `<svg width="${size}" height="${size}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#FFE44D;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#FFD700;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#F5A623;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${size}" height="${size}" fill="url(#bg)"/>
    </svg>`
  );

  const pad = Math.max(1, Math.round(size * 0.05));
  const logoSize = size - (pad * 2);

  const resizedLogo = await sharp(LOGO_SRC)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp(roundedRect)
    .composite([{ input: resizedLogo, top: pad, left: pad }])
    .png()
    .toBuffer();
}

function buildICO(pngBuffers, sizes) {
  // ICO file format:
  // Header: 6 bytes
  // Entry per image: 16 bytes each
  // Image data: concatenated PNG buffers

  const numImages = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + (entrySize * numImages);

  // Calculate total size
  let totalDataSize = 0;
  pngBuffers.forEach(buf => totalDataSize += buf.length);
  const totalSize = dataOffset + totalDataSize;

  const ico = Buffer.alloc(totalSize);

  // Header
  ico.writeUInt16LE(0, 0);      // Reserved
  ico.writeUInt16LE(1, 2);      // Type: 1 = ICO
  ico.writeUInt16LE(numImages, 4); // Number of images

  // Entries
  let currentOffset = dataOffset;
  for (let i = 0; i < numImages; i++) {
    const entryStart = headerSize + (i * entrySize);
    const size = sizes[i];
    
    ico.writeUInt8(size >= 256 ? 0 : size, entryStart);     // Width (0 = 256)
    ico.writeUInt8(size >= 256 ? 0 : size, entryStart + 1); // Height (0 = 256)
    ico.writeUInt8(0, entryStart + 2);                        // Color palette
    ico.writeUInt8(0, entryStart + 3);                        // Reserved
    ico.writeUInt16LE(1, entryStart + 4);                     // Color planes
    ico.writeUInt16LE(32, entryStart + 6);                    // Bits per pixel
    ico.writeUInt32LE(pngBuffers[i].length, entryStart + 8);  // Size of image data
    ico.writeUInt32LE(currentOffset, entryStart + 12);         // Offset to image data

    pngBuffers[i].copy(ico, currentOffset);
    currentOffset += pngBuffers[i].length;
  }

  return ico;
}

async function main() {
  console.log('🎨 Generating favicon.ico with Crazy Chrono branding...\n');

  const sizes = [16, 32, 48];
  const pngBuffers = [];

  for (const size of sizes) {
    const buf = await createIconPNG(size);
    pngBuffers.push(buf);
    console.log(`  ✅ ${size}x${size} PNG: ${buf.length} bytes`);
  }

  const ico = buildICO(pngBuffers, sizes);
  fs.writeFileSync(OUTPUT, ico);
  console.log(`\n🎉 favicon.ico generated: ${OUTPUT} (${ico.length} bytes)`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
