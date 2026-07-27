/**
 * NJ News Hub → Instagram Post Creator
 *
 * Picks an article from njnewshub.com and formats an Instagram-ready
 * caption plus optional 1080×1080 image from the article picture.
 */

import { Actor, log } from 'apify';
import { resolveArticle } from './scrape.js';
import { formatInstagramCaption } from './formatInstagram.js';
import { createInstagramImage } from './createImage.js';

await Actor.init();

try {
    const input = (await Actor.getInput()) ?? {};
    const {
        articleUrl = '',
        selection = 'featured',
        includeKeyPoints = true,
        maxCaptionLength = 2100,
        extraHashtags = ['NewJersey', 'NJNews', 'NJNewsHub'],
        generateImage = true,
        imageStyle = 'bottom-gradient',
    } = input;

    log.info('Resolving NJ News Hub article…', { articleUrl: articleUrl || null, selection });
    const article = await resolveArticle({ articleUrl, selection });
    log.info(`Selected: ${article.headline}`);
    log.info(`URL: ${article.articleUrl}`);

    const { caption, hashtags, characterCount } = formatInstagramCaption(article, {
        includeKeyPoints,
        maxCaptionLength,
        extraHashtags,
    });

    let instagramImageKey = null;
    let instagramImageUrl = null;

    if (generateImage && article.imageUrl) {
        log.info('Creating 1080×1080 Instagram image…', { imageStyle });
        const png = await createInstagramImage({
            imageUrl: article.imageUrl,
            headline: article.headline,
            city: article.city,
            style: imageStyle,
        });

        instagramImageKey = `instagram-${article.slug || 'post'}.png`;
        await Actor.setValue(instagramImageKey, png, { contentType: 'image/png' });

        // Public URL pattern when running on Apify platform
        const storeId = Actor.getEnv().defaultKeyValueStoreId;
        if (storeId) {
            instagramImageUrl = `https://api.apify.com/v2/key-value-stores/${storeId}/records/${instagramImageKey}`;
        }
        log.info(`Saved Instagram image to key-value store as ${instagramImageKey}`);
    } else if (generateImage) {
        log.warning('Article has no image URL; skipping image generation.');
    }

    const result = {
        articleUrl: article.articleUrl,
        headline: article.headline,
        summary: article.summary,
        caption,
        hashtags,
        characterCount,
        imageUrl: article.imageUrl,
        imageAlt: article.imageAlt,
        instagramImageKey,
        instagramImageUrl,
        city: article.city,
        category: article.category,
        source: article.source,
        county: article.county,
        keyPoints: article.keyPoints,
        keywords: article.keywords,
        publishedAt: article.publishedAt,
        canonicalUrl: article.canonicalUrl,
        selection: articleUrl ? 'provided-url' : selection,
        createdAt: new Date().toISOString(),
    };

    await Actor.pushData(result);
    // Also store a convenient copy in the default KV store
    await Actor.setValue('OUTPUT', result);

    log.info('Instagram post ready.', {
        characters: characterCount,
        hashtags: hashtags.length,
        image: Boolean(instagramImageKey),
    });
} catch (error) {
    log.exception(error, 'Actor failed');
    throw error;
} finally {
    await Actor.exit();
}
