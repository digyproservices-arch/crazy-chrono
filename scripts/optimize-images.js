/*
  Optimize JPEG images in public/images to reduce file size while keeping good visual quality.
  - Processes .jpg/.jpeg files only
  - Optionally resizes large images down to a maximum width
  - Re-encodes with reasonable JPEG quality
  - Overwrites files in-place (safe to run multiple times; originals sont récupérables via Git)
*/

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const imagesDir = path.join(process.cwd(), 'public', 'images');
const MAX_WIDTH = 1600; // pixels
const QUALITY = 70; // JPEG quality (0-100)

function isJpeg(file) {
  const ext = path.extname(file).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg';
}

async function processImage(file) {
  const fullPath = path.join(imagesDir, file);
  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) return;

  if (!isJpeg(file)) {
    console.log(`SKIP (not jpeg): ${file}`);
    return;
  }

  const beforeSize = stat.size;

  const image = sharp(fullPath);
  const metadata = await image.metadata();

  let pipeline = sharp(fullPath);

  if (metadata.width && metadata.width > MAX_WIDTH) {
    pipeline = pipeline.resize({ width: MAX_WIDTH });
  }

  const tempPath = fullPath + '.tmp';

  await pipeline
    .jpeg({
      quality: QUALITY,
      mozjpeg: true,
    })
    .toFile(tempPath);

  const afterSize = fs.statSync(tempPath).size;

  fs.renameSync(tempPath, fullPath);

  const saved = beforeSize - afterSize;
  const pct = beforeSize > 0 ? ((saved / beforeSize) * 100).toFixed(1) : 0;

  console.log(
    `OPTIMIZED ${file}: ${Math.round(beforeSize / 1024)}KB -> ${Math.round(
      afterSize / 1024
    )}KB (${pct}% saved)`
  );
}

async function main() {
  if (!fs.existsSync(imagesDir)) {
    console.error('Images directory not found:', imagesDir);
    process.exit(1);
  }

  const files = fs.readdirSync(imagesDir);
  let processed = 0;

  for (const file of files) {
    try {
      await processImage(file);
      processed++;
    } catch (err) {
      console.warn(`WARN: failed to optimize ${file}: ${err.message}`);
    }
  }

  console.log(`Done. Processed ${processed} files.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
