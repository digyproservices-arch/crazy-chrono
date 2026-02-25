/**
 * Generate PWA icons for Crazy Chrono
 * Creates logo192.png, logo512.png with yellow background + Crazy Chrono mascot
 * Also creates a favicon (favicon.ico replacement as favicon.png)
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const LOGO_SRC = path.join(__dirname, '..', 'public', 'images', 'logo_crazy_chrono.png');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'images');
const FAVICON_DIR = path.join(__dirname, '..', 'public');

// Yellow gradient background color (matching the chrono mascot)
const YELLOW_BG = '#FFD700';
const CORNER_RADIUS_RATIO = 0.18; // 18% of icon size for rounded corners

async function generateIcon(size, outputPath, padding = 0.1) {
  const pad = Math.round(size * padding);
  const logoSize = size - (pad * 2);
  
  // Create yellow background with rounded corners
  const roundedRect = Buffer.from(
    `<svg width="${size}" height="${size}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#FFE44D;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#FFD700;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#F5A623;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${size}" height="${size}" rx="${Math.round(size * CORNER_RADIUS_RATIO)}" ry="${Math.round(size * CORNER_RADIUS_RATIO)}" fill="url(#bg)"/>
    </svg>`
  );

  // Resize logo to fit inside with padding
  const resizedLogo = await sharp(LOGO_SRC)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Composite logo on top of yellow background
  await sharp(roundedRect)
    .composite([{
      input: resizedLogo,
      top: pad,
      left: pad,
    }])
    .png()
    .toFile(outputPath);

  console.log(`✅ Generated: ${outputPath} (${size}x${size})`);
}

async function generateFavicon() {
  // Generate a 64x64 favicon PNG (will be referenced as favicon.png)
  // For favicon, use less padding and just the mascot face part
  const size = 64;
  const pad = Math.round(size * 0.05);
  const logoSize = size - (pad * 2);

  const roundedRect = Buffer.from(
    `<svg width="${size}" height="${size}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#FFE44D;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#FFD700;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#F5A623;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" ry="${Math.round(size * 0.2)}" fill="url(#bg)"/>
    </svg>`
  );

  const resizedLogo = await sharp(LOGO_SRC)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Output as PNG (modern browsers support PNG favicons)
  const faviconPath = path.join(FAVICON_DIR, 'favicon.png');
  await sharp(roundedRect)
    .composite([{
      input: resizedLogo,
      top: pad,
      left: pad,
    }])
    .png()
    .toFile(faviconPath);

  console.log(`✅ Generated: ${faviconPath} (${size}x${size})`);

  // Also generate 32x32 for ICO compatibility
  const favicon32Path = path.join(FAVICON_DIR, 'favicon-32.png');
  await sharp(faviconPath)
    .resize(32, 32)
    .png()
    .toFile(favicon32Path);
  
  console.log(`✅ Generated: ${favicon32Path} (32x32)`);
}

async function main() {
  console.log('🎨 Generating Crazy Chrono PWA icons...\n');
  
  if (!fs.existsSync(LOGO_SRC)) {
    console.error('❌ Logo source not found:', LOGO_SRC);
    process.exit(1);
  }

  // Generate PWA icons
  await generateIcon(192, path.join(OUTPUT_DIR, 'logo192.png'), 0.08);
  await generateIcon(512, path.join(OUTPUT_DIR, 'logo512.png'), 0.08);
  
  // Generate Apple touch icon (180x180 is recommended for iOS)
  await generateIcon(180, path.join(OUTPUT_DIR, 'apple-touch-icon.png'), 0.08);
  
  // Generate favicon
  await generateFavicon();

  console.log('\n🎉 All icons generated successfully!');
  console.log('📱 Re-deploy and re-add to home screen to see the new icon.');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
