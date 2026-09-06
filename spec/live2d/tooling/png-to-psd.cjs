// Lossless container conversion only: retains the original single RGBA layer.
const fs = require('node:fs');
const { writePsdBuffer } = require('ag-psd');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || fs.existsSync(output)) throw new Error('Supply input and a new output path');
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const imageData = { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  fs.writeFileSync(output, writePsdBuffer({ width: info.width, height: info.height, imageData,
    children: [{ name: 'Arrodes_Base', imageData }] }, { generateThumbnail: false }));
  console.log(JSON.stringify({ output, width: info.width, height: info.height, layers: 1 }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
