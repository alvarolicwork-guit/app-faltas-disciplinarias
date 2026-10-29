// Deterministic format/size conversion of the existing institutional shield.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "public/escudo-policia-boliviana.png");
const background = "#f7faf5";

async function icon(size, ratio = 0.94) {
  const edge = Math.floor(size * ratio);
  const shield = await sharp(source).resize(edge, edge, { fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: shield, gravity: "centre" }]).png().toBuffer();
}

await fs.mkdir(path.join(root, "public/icons"), { recursive: true });
for (const size of [192, 512]) {
  await fs.writeFile(path.join(root, `public/icons/policia-${size}.png`), await icon(size));
}
// A rectangle inside a 0.64-wide square fits entirely in the maskable safe circle.
await fs.writeFile(path.join(root, "public/icons/policia-maskable-512.png"), await icon(512, 0.64));
await fs.writeFile(path.join(root, "src/app/apple-icon.png"), await icon(180));
await fs.writeFile(path.join(root, "src/app/icon.png"), await icon(32));

const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map(size => icon(size)));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, i) => {
  const entry = 6 + i * 16;
  header[entry] = sizes[i];
  header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await fs.writeFile(path.join(root, "src/app/favicon.ico"), Buffer.concat([header, ...frames]));
console.log("Generated browser, Apple and installation icons from the existing shield.");
