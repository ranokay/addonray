import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const markSizes = [16, 32, 48, 64, 96, 128, 256, 512];
const packageSizes = [16, 32, 48, 96, 128];
const monoRasterSizes = [16, 32, 48, 96, 128, 256, 512];
const root = process.cwd();
const exportsDirectory = join(root, 'assets/brand/exports');
const mastersDirectory = join(root, 'assets/brand/masters');
const publicDirectory = join(root, 'public');

type Png = {
  width: number;
  height: number;
  pixels: Buffer;
};

function decodePng(bytes: Buffer): Png {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.subarray(0, 8)).toEqual(signature);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const compressed: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  expect({ bitDepth, colorType, interlace }).toEqual({
    bitDepth: 8,
    colorType: 6,
    interlace: 0,
  });
  const raw = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source];
    source += 1;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source]!;
      source += 1;
      const left = x >= 4 ? pixels[y * stride + x - 4]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
      } else expect(filter).toBe(0);
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}

async function loadPng(path: string) {
  return decodePng(await readFile(path));
}

function visibleColors(png: Png) {
  const colors = new Map<string, number>();
  for (let index = 0; index < png.pixels.length; index += 4) {
    const alpha = png.pixels[index + 3]!;
    if (alpha !== 255) continue;
    const key = `#${[0, 1, 2]
      .map((channel) =>
        png.pixels[index + channel]!.toString(16).padStart(2, '0'),
      )
      .join('')}`;
    colors.set(key, (colors.get(key) ?? 0) + 1);
  }
  return colors;
}

function alphaCounts(png: Png) {
  let transparent = 0;
  let opaque = 0;
  for (let index = 3; index < png.pixels.length; index += 4) {
    const alpha = png.pixels[index]!;
    if (alpha === 0) transparent += 1;
    if (alpha === 255) opaque += 1;
  }
  return { transparent, opaque };
}

describe('brand asset kit', () => {
  it('ships every canonical mark size as transparent RGBA', async () => {
    for (const size of markSizes) {
      const png = await loadPng(
        join(exportsDirectory, `addonray-mark-${size}.png`),
      );
      expect({ width: png.width, height: png.height }).toEqual({
        width: size,
        height: size,
      });
      const alpha = alphaCounts(png);
      expect(alpha.transparent).toBeGreaterThan(0);
      expect(alpha.opaque).toBeGreaterThan(0);
      const colors = visibleColors(png);
      expect(colors.has('#2f8f63')).toBe(true);
      expect(colors.has('#b6e4ca')).toBe(true);
    }
  });

  it('ships monochrome black and white marks as transparent RGBA', async () => {
    for (const size of monoRasterSizes) {
      for (const color of ['black', 'white']) {
        const png = await loadPng(
          join(exportsDirectory, `addonray-mark-mono-${color}-${size}.png`),
        );
        expect({ width: png.width, height: png.height }).toEqual({
          width: size,
          height: size,
        });
        const alpha = alphaCounts(png);
        expect(alpha.transparent).toBeGreaterThan(0);
        expect(alpha.opaque).toBeGreaterThan(0);
        const colors = [...visibleColors(png).keys()];
        expect(colors).toEqual([color === 'black' ? '#000000' : '#ffffff']);
      }
    }
  });

  it('keeps package icons byte-identical to their canonical exports', async () => {
    for (const size of packageSizes) {
      const canonical = await readFile(
        join(exportsDirectory, `addonray-mark-${size}.png`),
      );
      const packaged = await readFile(
        join(publicDirectory, `icon-${size}.png`),
      );
      const hash = (bytes: Buffer) =>
        createHash('sha256').update(bytes).digest('hex');
      expect(hash(packaged)).toBe(hash(canonical));
    }
  });

  it('ships usable lockups and a reusable store tile at declared sizes', async () => {
    const lockups = [
      ['addonray-lockup-320.png', 320, 80],
      ['addonray-lockup-640.png', 640, 160],
      ['addonray-lockup-mono-white-320.png', 320, 80],
      ['addonray-lockup-mono-white-640.png', 640, 160],
    ] as const;
    for (const [name, width, height] of lockups) {
      const png = await loadPng(join(exportsDirectory, name));
      expect({ width: png.width, height: png.height }).toEqual({
        width,
        height,
      });
      const alpha = alphaCounts(png);
      expect(alpha.transparent).toBeGreaterThan(0);
      expect(alpha.opaque).toBeGreaterThan(0);
    }
    for (const size of [300, 512]) {
      const png = await loadPng(
        join(exportsDirectory, `addonray-store-tile-${size}.png`),
      );
      expect({ width: png.width, height: png.height }).toEqual({
        width: size,
        height: size,
      });
      expect(alphaCounts(png).opaque).toBeGreaterThan(0);
    }
  });

  it('keeps editable masters free of external references', async () => {
    for (const name of [
      'addonray-mark.svg',
      'addonray-mark-small.svg',
      'addonray-mark-monochrome.svg',
      'addonray-mark-mono-white.svg',
      'addonray-lockup.svg',
      'addonray-lockup-mono-white.svg',
      'addonray-store-tile.svg',
    ]) {
      const svg = await readFile(join(mastersDirectory, name), 'utf8');
      expect(svg).toContain('<svg');
      expect(svg).toContain('<title');
      expect(svg).not.toMatch(/<image|<script|href=|src=|@import|url\((?!#)/i);
    }
  });
});
