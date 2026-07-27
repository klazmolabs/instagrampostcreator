/**
 * Scrapes article data from njnewshub.com homepage and article pages.
 */

import * as cheerio from 'cheerio';

const BASE_URL = 'https://njnewshub.com';
const DEFAULT_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (compatible; NJNewsHubInstagramActor/1.0; +https://apify.com)',
    Accept: 'text/html,application/xhtml+xml',
};

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function fetchHtml(url) {
    const response = await fetch(url, { headers: DEFAULT_HEADERS, redirect: 'follow' });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.text();
}

/**
 * Decode common HTML entities in meta / text values.
 * @param {string} value
 */
function decodeEntities(value = '') {
    return value
        .replace(/&#x27;/gi, "'")
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/&#x22;/gi, '"')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&nbsp;/gi, ' ')
        .trim();
}

/**
 * Extract a balanced `{...}` JSON object starting at `start` (must point at `{`).
 * @param {string} text
 * @param {number} start
 * @returns {string|null}
 */
function extractBalancedObject(text, start) {
    if (text[start] !== '{') return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return null;
}

/**
 * Unescape a Next.js flight-data string fragment so JSON can be parsed.
 * @param {string} value
 */
function unescapeFlightString(value) {
    return value
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
}

/**
 * Try to parse an article object starting after an `"article":` / `\"article\":` marker.
 * @param {string} html
 * @param {number} valueStart Index of `{` (or `\{` pattern's `{`) beginning the object
 * @param {boolean} escaped Whether the surrounding payload uses `\"` escapes
 */
function parseArticleAt(html, valueStart, escaped) {
    const window = html.slice(valueStart, valueStart + 50000);
    const source = escaped ? unescapeFlightString(window) : window;
    const braceAt = source.indexOf('{');
    if (braceAt !== 0 && braceAt !== -1) {
        // after unescape, object should start at 0
    }
    const start = source[0] === '{' ? 0 : source.indexOf('{');
    if (start < 0) return null;
    const raw = extractBalancedObject(source, start);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Normalize an embedded article object into a flat record.
 * @param {Record<string, unknown>} article
 */
function normalizeArticle(article) {
    const citySlug = article.cities?.slug || 'new-jersey';
    return {
        id: article.id,
        slug: article.slug,
        headline: decodeEntities(article.headline),
        summary: decodeEntities(article.ai_summary || article.feed_excerpt || ''),
        imageUrl: article.image_url || null,
        imageAlt: decodeEntities(article.image_alt || ''),
        keyPoints: Array.isArray(article.key_points) ? article.key_points.map(decodeEntities) : [],
        keywords: Array.isArray(article.keywords) ? article.keywords.map(decodeEntities) : [],
        category: article.categories?.name || null,
        city: article.cities?.name || null,
        citySlug,
        county: article.county || article.cities?.county || null,
        source: article.sources?.name || null,
        canonicalUrl: article.canonical_url || null,
        publishedAt: article.published_at || article.published_site_at || null,
        articleUrl: `${BASE_URL}/${citySlug}/${article.slug}`,
        isFeatured: Boolean(article.is_featured),
    };
}

/**
 * Extract embedded article objects from Next.js RSC payload / DOM.
 * @param {string} html
 * @returns {Array<Record<string, unknown>>}
 */
export function extractArticlesFromHomepage(html) {
    const articles = [];
    const seen = new Set();

    const pushArticle = (article) => {
        if (!article?.slug || !article?.headline) return;
        const key = article.id || article.slug;
        if (seen.has(key)) return;
        seen.add(key);
        articles.push(normalizeArticle(article));
    };

    // 1) Plain JSON objects: "article":{...}
    let from = 0;
    const plainMarker = '"article":';
    while (from < html.length) {
        const idx = html.indexOf(plainMarker, from);
        if (idx === -1) break;
        const valueStart = idx + plainMarker.length;
        from = valueStart + 1;
        // Skip if this is actually an escaped marker we handle below
        if (idx > 0 && html[idx - 1] === '\\') continue;
        if (html[valueStart] !== '{') continue;
        const raw = extractBalancedObject(html, valueStart);
        if (!raw) continue;
        try {
            pushArticle(JSON.parse(raw));
        } catch {
            // ignore
        }
    }

    // 2) Escaped flight-data objects: \"article\":{...}
    from = 0;
    const escapedMarker = '\\"article\\":';
    while (from < html.length) {
        const idx = html.indexOf(escapedMarker, from);
        if (idx === -1) break;
        const valueStart = idx + escapedMarker.length;
        from = valueStart + 1;
        const article = parseArticleAt(html, valueStart, true);
        pushArticle(article);
    }

    // 3) DOM fallback — keep order of home headlines, attach nearby images.
    if (articles.length === 0) {
        const $ = cheerio.load(html);
        $('a.home-headline').each((_, el) => {
            const href = $(el).attr('href');
            if (!href || !/^\/[^/]+\/[^/]+\/?$/.test(href)) return;
            const absolute = new URL(href, BASE_URL).href;
            if (seen.has(absolute)) return;
            seen.add(absolute);
            const parts = href.split('/').filter(Boolean);
            const $article = $(el).closest('article');
            const imageUrl =
                $article.find('img').first().attr('src') ||
                $(el).parent().parent().find('img').first().attr('src') ||
                null;
            articles.push({
                articleUrl: absolute,
                headline: decodeEntities($(el).text()),
                slug: parts[parts.length - 1],
                citySlug: parts[0],
                imageUrl,
                summary: decodeEntities($article.find('p').first().text()),
            });
        });
    }

    return articles;
}

/**
 * Pick one article from a list based on selection mode.
 * @param {Array<Record<string, unknown>>} articles
 * @param {'featured'|'latest'|'random'} selection
 */
export function pickArticle(articles, selection = 'featured') {
    if (!articles.length) {
        throw new Error('No articles found on njnewshub.com homepage.');
    }
    if (selection === 'random') {
        return articles[Math.floor(Math.random() * articles.length)];
    }
    if (selection === 'latest') {
        // Homepage "Latest" grid items appear after the featured story in our parse order.
        return articles.length > 1 ? articles[1] : articles[0];
    }
    // featured = first rich article (homepage hero)
    return articles[0];
}

/**
 * Title-case a slug or loose phrase.
 * @param {string} value
 */
function titleCase(value = '') {
    return String(value)
        .replace(/[-_]+/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Prefer the longer non-empty string (useful for summaries).
 * @param {string|null|undefined} primary
 * @param {string|null|undefined} fallback
 */
function preferLonger(primary, fallback) {
    const a = (primary || '').trim();
    const b = (fallback || '').trim();
    if (!a) return b || null;
    if (!b) return a;
    return a.length >= b.length ? a : b;
}

/**
 * Find the embedded article object that matches a page URL, if any.
 * @param {string} html
 * @param {string} articleUrl
 */
function findEmbeddedArticleForUrl(html, articleUrl) {
    const articles = extractArticlesFromHomepage(html);
    const path = new URL(articleUrl).pathname.replace(/\/$/, '');
    const slug = path.split('/').filter(Boolean).pop();
    return (
        articles.find((a) => {
            const aPath = a.articleUrl?.replace(/\/$/, '').replace(BASE_URL, '') || '';
            return aPath === path || a.slug === slug;
        }) || null
    );
}

/**
 * Scrape a single article page for structured fields.
 * @param {string} articleUrl
 */
export async function scrapeArticlePage(articleUrl) {
    const html = await fetchHtml(articleUrl);
    const $ = cheerio.load(html);

    const meta = (name) =>
        decodeEntities(
            $(`meta[property="${name}"]`).attr('content') ||
                $(`meta[name="${name}"]`).attr('content') ||
                '',
        );

    let ldArticle = null;
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).html() || '{}');
            if (data['@type'] === 'Article') ldArticle = data;
        } catch {
            // ignore
        }
    });

    const embedded = findEmbeddedArticleForUrl(html, articleUrl);

    const headline =
        embedded?.headline ||
        decodeEntities($('h1').first().text()) ||
        decodeEntities(ldArticle?.headline || '') ||
        meta('og:title');

    const summary =
        preferLonger(
            embedded?.summary,
            preferLonger(meta('og:description'), decodeEntities(ldArticle?.description || '')),
        ) || decodeEntities($('article p, main p').first().text());

    const imageUrl =
        embedded?.imageUrl ||
        meta('og:image') ||
        (Array.isArray(ldArticle?.image) ? ldArticle.image[0] : ldArticle?.image) ||
        $('main img').first().attr('src') ||
        null;

    const pathParts = new URL(articleUrl).pathname.split('/').filter(Boolean);

    let keyPoints = embedded?.keyPoints || [];
    let keywords = embedded?.keywords || [];

    if (!keywords.length) {
        const metaKeywords = meta('keywords');
        if (metaKeywords) {
            keywords = metaKeywords
                .split(',')
                .map((k) => decodeEntities(k))
                .filter(Boolean);
        }
    }

    if (!keyPoints.length) {
        $('h2, h3').each((_, el) => {
            const heading = decodeEntities($(el).text()).toLowerCase();
            if (!heading.includes('key point') && heading !== 'highlights') return;
            $(el)
                .nextAll('ul')
                .first()
                .find('li')
                .each((__, li) => {
                    const text = decodeEntities($(li).text());
                    if (text) keyPoints.push(text);
                });
        });
        if (!keyPoints.length) {
            $('main ul li, article ul li').each((_, el) => {
                const text = decodeEntities($(el).text());
                if (text.length > 20 && text.length < 220) keyPoints.push(text);
            });
        }
        keyPoints = keyPoints.slice(0, 5);
    }

    let city = embedded?.city || null;
    let source = embedded?.source || null;
    const byline = decodeEntities(
        $('main p')
            .filter((_, el) => {
                const t = $(el).text();
                return /·/.test(t) && t.length < 120 && !/key point/i.test(t);
            })
            .first()
            .text(),
    );
    if (byline) {
        const parts = byline
            .split('·')
            .map((p) => p.trim())
            .filter(Boolean)
            .filter((p) => !/^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}$/.test(p));
        // Typical: "Bayonne · River View Observer · Jul 27, 2026"
        if (!city && parts[0]) city = parts[0];
        if (!source && parts[1]) source = parts[1];
    }

    const citySlug = embedded?.citySlug || pathParts[0] || null;
    if (!city && citySlug && citySlug !== 'new-jersey') city = titleCase(citySlug);

    return {
        articleUrl,
        headline,
        summary,
        imageUrl,
        imageAlt: embedded?.imageAlt || meta('og:image:alt') || headline,
        keyPoints,
        keywords,
        category: embedded?.category || null,
        city,
        citySlug,
        county: embedded?.county || null,
        source,
        canonicalUrl: embedded?.canonicalUrl || ldArticle?.mainEntityOfPage || articleUrl,
        publishedAt: embedded?.publishedAt || ldArticle?.datePublished || null,
        slug: embedded?.slug || pathParts[pathParts.length - 1] || null,
    };
}

/**
 * Merge homepage-rich fields with article-page fields, preferring the richer value.
 * @param {Record<string, unknown>} picked
 * @param {Record<string, unknown>} detailed
 */
function mergeArticleData(picked, detailed) {
    return {
        ...picked,
        ...detailed,
        headline: picked.headline || detailed.headline,
        summary: preferLonger(picked.summary, detailed.summary),
        imageUrl: picked.imageUrl || detailed.imageUrl,
        imageAlt: picked.imageAlt || detailed.imageAlt,
        keyPoints:
            (picked.keyPoints?.length ? picked.keyPoints : null) ||
            detailed.keyPoints ||
            [],
        keywords:
            (picked.keywords?.length ? picked.keywords : null) ||
            detailed.keywords ||
            [],
        category: picked.category || detailed.category,
        city: picked.city || detailed.city,
        citySlug: picked.citySlug || detailed.citySlug,
        county: picked.county || detailed.county,
        source: picked.source || detailed.source,
        canonicalUrl: picked.canonicalUrl || detailed.canonicalUrl,
        publishedAt: picked.publishedAt || detailed.publishedAt,
        slug: picked.slug || detailed.slug,
        articleUrl: detailed.articleUrl || picked.articleUrl,
    };
}

/**
 * Resolve the article to format: either a provided URL or an auto-picked homepage story.
 * @param {{ articleUrl?: string, selection?: string }} input
 */
export async function resolveArticle(input = {}) {
    const { articleUrl, selection = 'featured' } = input;

    if (articleUrl && String(articleUrl).trim()) {
        const url = String(articleUrl).trim();
        if (!url.includes('njnewshub.com')) {
            throw new Error('articleUrl must be a njnewshub.com URL.');
        }
        return scrapeArticlePage(url);
    }

    const homeHtml = await fetchHtml(BASE_URL);
    const articles = extractArticlesFromHomepage(homeHtml);
    const picked = pickArticle(articles, selection);

    if (picked.articleUrl) {
        const detailed = await scrapeArticlePage(picked.articleUrl);
        return mergeArticleData(picked, detailed);
    }

    return picked;
}

export { BASE_URL };
