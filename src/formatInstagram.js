/**
 * Formats scraped NJ News Hub article data into an Instagram caption + hashtags.
 */

const DEFAULT_HASHTAGS = ['NewJersey', 'NJNews', 'NJNewsHub'];

/**
 * Convert a phrase into a CamelCase hashtag token without spaces/punctuation.
 * @param {string} value
 */
export function toHashtag(value) {
    const cleaned = String(value || '')
        .replace(/[#]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .trim();
    if (!cleaned) return null;
    const camel = cleaned
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    if (!camel || /^\d+$/.test(camel)) return null;
    return `#${camel}`;
}

/**
 * Build a unique hashtag list from article keywords + extras.
 * @param {object} article
 * @param {string[]} extraHashtags
 */
export function buildHashtags(article, extraHashtags = []) {
    const tags = new Set();

    for (const kw of article.keywords || []) {
        const tag = toHashtag(kw);
        if (tag) tags.add(tag);
    }

    for (const value of [article.city, article.category, article.county, ...(extraHashtags || []), ...DEFAULT_HASHTAGS]) {
        const tag = toHashtag(value);
        if (tag) tags.add(tag);
    }

    return [...tags].slice(0, 20);
}

/**
 * Truncate text near a word boundary.
 * @param {string} text
 * @param {number} max
 */
function truncate(text, max) {
    if (!text || text.length <= max) return text;
    const sliced = text.slice(0, max - 1);
    const lastSpace = sliced.lastIndexOf(' ');
    return `${(lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced).trim()}…`;
}

/**
 * Build Instagram caption from article fields.
 * @param {object} article
 * @param {{ includeKeyPoints?: boolean, maxCaptionLength?: number, extraHashtags?: string[] }} options
 */
export function formatInstagramCaption(article, options = {}) {
    const {
        includeKeyPoints = true,
        maxCaptionLength = 2100,
        extraHashtags = DEFAULT_HASHTAGS,
    } = options;

    const hashtags = buildHashtags(article, extraHashtags);
    const lines = [];

    lines.push(article.headline?.trim() || 'New Jersey news update');
    lines.push('');

    if (article.summary) {
        lines.push(truncate(article.summary.trim(), 500));
        lines.push('');
    }

    if (includeKeyPoints && article.keyPoints?.length) {
        for (const point of article.keyPoints.slice(0, 4)) {
            lines.push(`• ${truncate(point.trim(), 180)}`);
        }
        lines.push('');
    }

    const metaBits = [article.city, article.source].filter(Boolean);
    if (metaBits.length) {
        lines.push(metaBits.join(' · '));
        lines.push('');
    }

    lines.push(`Read more: ${article.articleUrl}`);
    lines.push('');
    lines.push('Via NJ News Hub');
    lines.push('');
    lines.push(hashtags.join(' '));

    let caption = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    if (caption.length > maxCaptionLength) {
        const tagBlock = hashtags.join(' ');
        const reserved = tagBlock.length + 20;
        const bodyMax = Math.max(200, maxCaptionLength - reserved);
        const withoutTags = caption.slice(0, caption.lastIndexOf(tagBlock)).trim();
        caption = `${truncate(withoutTags, bodyMax)}\n\n${tagBlock}`;
    }

    return {
        caption,
        hashtags,
        characterCount: caption.length,
    };
}
