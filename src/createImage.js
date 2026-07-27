/**
 * Compose a 1080×1080 Instagram image from an article photo + headline.
 * Uses @resvg/resvg-js with bundled Noto fonts so text never renders as □ boxes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';

const SIZE = 1080;
const DEFAULT_BRAND = 'NJ NEWS HUB';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');

const FONT_FILES = [
    'NotoSerif-Bold.ttf',
    'NotoSans-Bold.ttf',
    'NotoSans-Regular.ttf',
].map((name) => path.join(FONTS_DIR, name));

/**
 * Approximate wrap using average glyph width for the chosen font size.
 * @param {string} text
 * @param {number} fontSize
 * @param {number} maxWidth
 */
function wrapText(text, fontSize, maxWidth = 920) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const avgChar = fontSize * 0.52;
    const maxChars = Math.max(12, Math.floor(maxWidth / avgChar));
    const lines = [];
    let current = '';
    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > maxChars && current) {
            lines.push(current);
            current = word;
        } else {
            current = next;
        }
    }
    if (current) lines.push(current);
    return lines.slice(0, 4);
}

/**
 * Escape XML special characters for SVG text.
 * @param {string} value
 */
function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Pick headline font size from length so long titles still fit.
 * @param {string} headline
 */
function headlineFontSize(headline) {
    const len = String(headline || '').length;
    if (len > 110) return 36;
    if (len > 80) return 40;
    if (len > 55) return 46;
    return 52;
}

/**
 * Build SVG overlay for the square canvas.
 * Font family names must match the bundled Noto TTF name tables.
 * @param {{ headline: string, city?: string|null, style: string, brandLabel?: string|null }} opts
 */
function buildOverlaySvg({ headline, city, style, brandLabel = DEFAULT_BRAND }) {
    const fontSize = headlineFontSize(headline);
    const lines = wrapText(headline, fontSize, 900);
    const lineHeight = Math.round(fontSize * 1.22);

    const brandY = SIZE - 52;
    const textBottom = style === 'full-overlay' ? SIZE / 2 + (lines.length * lineHeight) / 2 - 8 : brandY - 64;
    const startY = textBottom - (lines.length - 1) * lineHeight;

    const textLines = lines
        .map((line, i) => {
            const y = startY + i * lineHeight;
            return `<text x="540" y="${y}" text-anchor="middle" font-family="Noto Serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`;
        })
        .join('\n');

    const cityLabel = city
        ? `<text x="540" y="${Math.max(48, startY - 40)}" text-anchor="middle" font-family="Noto Sans" font-size="22" font-weight="700" fill="#F2C14E">${escapeXml(String(city).toUpperCase())}</text>`
        : '';

    const brand =
        brandLabel && String(brandLabel).trim()
            ? `<text x="540" y="${brandY}" text-anchor="middle" font-family="Noto Sans" font-size="18" font-weight="700" fill="#FFFFFF">${escapeXml(String(brandLabel).trim().toUpperCase())}</text>`
            : '';

    const gradient =
        style === 'full-overlay'
            ? `<rect width="${SIZE}" height="${SIZE}" fill="rgba(8,18,36,0.58)"/>`
            : `<defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(8,18,36,0)"/>
            <stop offset="35%" stop-color="rgba(8,18,36,0.2)"/>
            <stop offset="100%" stop-color="rgba(8,18,36,0.9)"/>
          </linearGradient>
        </defs>
        <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  ${gradient}
  ${cityLabel}
  ${textLines}
  ${brand}
</svg>`;
}

/**
 * Download a remote image as a Buffer.
 * @param {string} url
 */
export async function downloadImage(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (compatible; NJNewsHubInstagramActor/1.0; +https://apify.com)',
            Accept: 'image/*,*/*',
        },
        redirect: 'follow',
    });
    if (!response.ok) {
        throw new Error(`Failed to download image ${url}: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

/**
 * Rasterize SVG overlay with bundled fonts via resvg.
 * @param {string} svg
 */
function rasterizeOverlay(svg) {
    for (const file of FONT_FILES) {
        if (!fs.existsSync(file)) {
            throw new Error(`Missing font ${file}. Include assets/fonts in the Actor build.`);
        }
    }

    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: SIZE },
        font: {
            loadSystemFonts: false,
            fontFiles: FONT_FILES,
            defaultFontFamily: 'Noto Sans',
        },
        background: 'rgba(0,0,0,0)',
    });

    const rendered = resvg.render();
    return Buffer.from(rendered.asPng());
}

/**
 * Create a 1080×1080 Instagram-ready PNG from the article image.
 * @param {{ imageUrl: string, headline: string, city?: string|null, style?: string, brandLabel?: string|null }} opts
 * @returns {Promise<Buffer>}
 */
export async function createInstagramImage({
    imageUrl,
    headline,
    city = null,
    style = 'bottom-gradient',
    brandLabel = DEFAULT_BRAND,
}) {
    if (!imageUrl) {
        throw new Error('Cannot create Instagram image without an article image URL.');
    }

    const source = await downloadImage(imageUrl);

    const base = await sharp(source)
        .rotate()
        .resize(SIZE, SIZE, {
            fit: 'cover',
            position: 'attention',
            withoutEnlargement: false,
        })
        .ensureAlpha()
        .toColourspace('srgb')
        .png({ compressionLevel: 8 })
        .toBuffer();

    if (style === 'image-only') {
        return base;
    }

    const svg = buildOverlaySvg({ headline, city, style, brandLabel });
    let overlay = rasterizeOverlay(svg);

    // Force exact SIZE×SIZE in case resvg rounds differently.
    overlay = await sharp(overlay)
        .resize(SIZE, SIZE, { fit: 'fill' })
        .png()
        .toBuffer();

    return sharp(base)
        .composite([{ input: overlay, top: 0, left: 0 }])
        .png({ compressionLevel: 8 })
        .toBuffer();
}
