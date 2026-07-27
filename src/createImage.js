/**
 * Compose a 1080×1080 Instagram image from an article photo + headline.
 */

import sharp from 'sharp';

const SIZE = 1080;
const BRAND = 'NJ NEWS HUB';

/**
 * Wrap text into lines that fit within maxCharsPerLine.
 * @param {string} text
 * @param {number} maxChars
 */
function wrapText(text, maxChars = 28) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
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
    return lines.slice(0, 5);
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
 * Build SVG overlay for the square canvas.
 * @param {{ headline: string, city?: string|null, style: string }} opts
 */
function buildOverlaySvg({ headline, city, style }) {
    const lines = wrapText(headline, style === 'full-overlay' ? 26 : 30);
    const lineHeight = style === 'full-overlay' ? 58 : 52;
    const startY =
        style === 'full-overlay'
            ? SIZE / 2 - ((lines.length - 1) * lineHeight) / 2
            : SIZE - 160 - (lines.length - 1) * lineHeight;

    const textLines = lines
        .map((line, i) => {
            const y = startY + i * lineHeight;
            return `<text x="540" y="${y}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="44" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`;
        })
        .join('\n');

    const cityLabel = city
        ? `<text x="540" y="${startY - 48}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="600" letter-spacing="3" fill="#F2C14E">${escapeXml(String(city).toUpperCase())}</text>`
        : '';

    const brandY = SIZE - 48;
    const gradient =
        style === 'full-overlay'
            ? `<rect width="1080" height="1080" fill="rgba(8,18,36,0.55)"/>`
            : `<defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(8,18,36,0)"/>
            <stop offset="45%" stop-color="rgba(8,18,36,0.35)"/>
            <stop offset="100%" stop-color="rgba(8,18,36,0.88)"/>
          </linearGradient>
        </defs>
        <rect width="1080" height="1080" fill="url(#g)"/>`;

    return Buffer.from(`
      <svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
        ${gradient}
        ${cityLabel}
        ${textLines}
        <text x="540" y="${brandY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="4" fill="#ffffff">${BRAND}</text>
      </svg>
    `);
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
 * Create a 1080×1080 Instagram-ready PNG from the article image.
 * @param {{ imageUrl: string, headline: string, city?: string|null, style?: string }} opts
 * @returns {Promise<Buffer>}
 */
export async function createInstagramImage({
    imageUrl,
    headline,
    city = null,
    style = 'bottom-gradient',
}) {
    if (!imageUrl) {
        throw new Error('Cannot create Instagram image without an article image URL.');
    }

    const source = await downloadImage(imageUrl);
    const base = sharp(source)
        .rotate()
        .resize(SIZE, SIZE, { fit: 'cover', position: 'attention' })
        .png();

    if (style === 'image-only') {
        return base.toBuffer();
    }

    const overlay = buildOverlaySvg({ headline, city, style });
    return sharp(await base.toBuffer())
        .composite([{ input: overlay, top: 0, left: 0 }])
        .png()
        .toBuffer();
}
