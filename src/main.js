/**
 * NJ News Hub → Instagram Post Creator
 *
 * Picks an article from njnewshub.com and formats an Instagram-ready
 * caption plus optional 1080×1080 image from the article picture.
 * Optionally publishes to Instagram using a sessionid cookie.
 */

import { Actor, log } from 'apify';
import { resolveArticle } from './scrape.js';
import { formatInstagramCaption } from './formatInstagram.js';
import { createInstagramImage } from './createImage.js';
import { postPhotoToInstagram } from './postToInstagram.js';

await Actor.init();

try {
    const input = (await Actor.getInput()) ?? {};
    const {
        articleUrl = '',
        selection = 'featured',
        includeKeyPoints = true,
        maxCaptionLength = 2100,
        extraHashtags = ['NewJersey', 'NJNews', 'NJNewsHub'],
        includeArticleLink = true,
        ctaText = 'Via NJ News Hub',
        generateImage = true,
        imageStyle = 'bottom-gradient',
        brandLabel = 'NJ NEWS HUB',
        postToInstagram = false,
        instagramSessionId = '',
        instagramUsername = '',
    } = input;

    if (postToInstagram && !String(instagramSessionId || '').trim()) {
        throw new Error(
            'Post to Instagram is enabled but instagramSessionId is missing. Paste your Instagram sessionid cookie in the input form.',
        );
    }

    // Force image generation when posting — Instagram needs the media file.
    const shouldGenerateImage = generateImage || postToInstagram;

    log.info('Resolving NJ News Hub article…', { articleUrl: articleUrl || null, selection });
    const article = await resolveArticle({ articleUrl, selection });
    log.info(`Selected: ${article.headline}`);
    log.info(`URL: ${article.articleUrl}`);

    const { caption, hashtags, characterCount } = formatInstagramCaption(article, {
        includeKeyPoints,
        maxCaptionLength,
        extraHashtags,
        includeArticleLink,
        ctaText,
    });

    let instagramImageKey = null;
    let instagramImageUrl = null;
    let imageBuffer = null;

    if (shouldGenerateImage && article.imageUrl) {
        log.info('Creating 1080×1080 Instagram image…', { imageStyle });
        imageBuffer = await createInstagramImage({
            imageUrl: article.imageUrl,
            headline: article.headline,
            city: article.city,
            style: imageStyle,
            brandLabel,
        });

        instagramImageKey = `instagram-${article.slug || 'post'}.png`;
        await Actor.setValue(instagramImageKey, imageBuffer, { contentType: 'image/png' });

        const storeId = Actor.getEnv().defaultKeyValueStoreId;
        if (storeId) {
            instagramImageUrl = `https://api.apify.com/v2/key-value-stores/${storeId}/records/${instagramImageKey}`;
        }
        log.info(`Saved Instagram image to key-value store as ${instagramImageKey}`);
    } else if (shouldGenerateImage) {
        log.warning('Article has no image URL; skipping image generation.');
    }

    let publishResult = {
        posted: false,
        skipped: !postToInstagram,
        reason: postToInstagram ? null : 'postToInstagram disabled',
    };

    if (postToInstagram) {
        if (!imageBuffer) {
            throw new Error('Cannot post to Instagram because no image was generated for this article.');
        }
        log.info('Posting to Instagram…');
        publishResult = await postPhotoToInstagram({
            sessionId: instagramSessionId,
            username: instagramUsername,
            imageBuffer,
            caption,
        });
        log.info('Instagram publish complete.', {
            username: publishResult.username,
            postUrl: publishResult.postUrl,
        });
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
        instagramPost: publishResult,
    };

    await Actor.pushData(result);
    await Actor.setValue('OUTPUT', result);

    log.info('Instagram post ready.', {
        characters: characterCount,
        hashtags: hashtags.length,
        image: Boolean(instagramImageKey),
        posted: Boolean(publishResult.posted),
        postUrl: publishResult.postUrl || null,
    });
} catch (error) {
    log.exception(error, 'Actor failed');
    throw error;
} finally {
    await Actor.exit();
}
