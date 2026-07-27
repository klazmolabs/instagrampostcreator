/**
 * Authenticate with an Instagram sessionid cookie and publish a feed photo.
 */

import { IgApiClient } from 'instagram-private-api';
import { Cookie } from 'tough-cookie';
import sharp from 'sharp';
import { log } from 'apify';

/**
 * Normalize a pasted session id / cookie value.
 * Accepts raw sessionid, `sessionid=...`, or a full Cookie header string.
 * Keeps URL-encoding (`%3A`) as Instagram stores it in the cookie jar.
 * @param {string} raw
 */
export function extractSessionId(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';

    // Full cookie header: "mid=...; sessionid=...; ds_user_id=..."
    if (/sessionid=/i.test(value) && /;/.test(value)) {
        const match = value.match(/(?:^|;\s*)sessionid=([^;]+)/i);
        if (match) return match[1].trim();
    }

    return value.replace(/^sessionid=/i, '').trim();
}

/**
 * Instagram session ids look like `{userId}:{secret}:{count}` (decoded).
 * @param {string} sessionId
 * @returns {string|null}
 */
export function extractUserIdFromSession(sessionId) {
    const decoded = decodeURIComponent(String(sessionId || ''));
    const userId = decoded.split(':')[0];
    return /^\d+$/.test(userId) ? userId : null;
}

/**
 * Convert any image buffer Instagram can display into a JPEG buffer.
 * @param {Buffer} imageBuffer
 */
export async function toInstagramJpeg(imageBuffer) {
    return sharp(imageBuffer)
        .rotate()
        .resize(1080, 1080, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
        .toBuffer();
}

/**
 * Create an authenticated IgApiClient from a sessionid cookie.
 * @param {{ sessionId: string, username?: string }} opts
 */
export async function createClientFromSession({ sessionId, username = '' }) {
    const cookieValue = extractSessionId(sessionId);
    if (!cookieValue) {
        throw new Error(
            'instagramSessionId is empty. Paste the sessionid cookie from a logged-in Instagram browser session.',
        );
    }

    const userId = extractUserIdFromSession(cookieValue);
    const deviceSeed = (username && String(username).trim()) || userId || 'njnewshub';

    const ig = new IgApiClient();
    ig.state.generateDevice(deviceSeed);

    const cookies = [
        new Cookie({
            key: 'sessionid',
            value: cookieValue,
            domain: '.instagram.com',
            path: '/',
            secure: true,
            httpOnly: true,
            hostOnly: false,
        }),
    ];

    if (userId) {
        cookies.push(
            new Cookie({
                key: 'ds_user_id',
                value: userId,
                domain: '.instagram.com',
                path: '/',
                secure: true,
                httpOnly: false,
                hostOnly: false,
            }),
        );
    }

    for (const cookie of cookies) {
        await ig.state.cookieJar.setCookie(cookie.toString(), 'https://i.instagram.com');
        await ig.state.cookieJar.setCookie(cookie.toString(), 'https://www.instagram.com');
    }

    // Validate the session by fetching the current user.
    const currentUser = await ig.account.currentUser();
    log.info(`Instagram session OK for @${currentUser.username}`);

    return { ig, currentUser };
}

/**
 * Publish a photo to the Instagram feed using a sessionid.
 * @param {{
 *   sessionId: string,
 *   username?: string,
 *   imageBuffer: Buffer,
 *   caption: string,
 * }} opts
 */
export async function postPhotoToInstagram({ sessionId, username = '', imageBuffer, caption }) {
    if (!imageBuffer?.length) {
        throw new Error('Cannot post to Instagram without an image buffer.');
    }

    const { ig, currentUser } = await createClientFromSession({ sessionId, username });
    const jpeg = await toInstagramJpeg(imageBuffer);

    log.info(`Publishing Instagram feed photo as @${currentUser.username}…`);
    const publishResult = await ig.publish.photo({
        file: jpeg,
        caption: caption || '',
    });

    const code = publishResult?.media?.code || null;
    const mediaId = publishResult?.media?.id || publishResult?.media?.pk || null;
    const postUrl = code ? `https://www.instagram.com/p/${code}/` : null;

    return {
        posted: true,
        username: currentUser.username,
        userId: String(currentUser.pk),
        mediaId: mediaId ? String(mediaId) : null,
        code,
        postUrl,
        publishedAt: new Date().toISOString(),
    };
}
