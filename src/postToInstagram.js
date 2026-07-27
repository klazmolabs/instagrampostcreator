/**
 * Publish to Instagram using browser cookies (sessionid), via the web/rupload flow.
 *
 * Browser sessionid cookies do NOT work with the Android private API client
 * (instagram-private-api) — that path returns "something went wrong".
 */

import sharp from 'sharp';
import { log } from 'apify';

const IG_WEB = 'https://www.instagram.com';
const IG_APP = 'https://i.instagram.com';
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Normalize a pasted session id / cookie value.
 * Accepts raw sessionid, `sessionid=...`, or a full Cookie header string.
 * @param {string} raw
 */
export function extractSessionId(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';

    if (/sessionid=/i.test(value)) {
        const match = value.match(/(?:^|;\s*)sessionid=([^;]+)/i);
        if (match) return match[1].trim();
    }

    return value.replace(/^sessionid=/i, '').trim();
}

/**
 * Extract a named cookie from a Cookie header / multi-cookie paste.
 * @param {string} raw
 * @param {string} name
 */
export function extractCookieValue(raw, name) {
    const value = String(raw || '').trim();
    if (!value) return '';
    const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, 'i');
    const match = value.match(re);
    return match ? match[1].trim() : '';
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
 * Build a Cookie header from session id + optional extras / full paste.
 * @param {{ sessionId: string, csrfToken?: string, cookies?: string }} opts
 */
export function buildCookieHeader({ sessionId = '', csrfToken = '', cookies = '' }) {
    const jar = new Map();

    const applyPair = (raw) => {
        const text = String(raw || '').trim();
        if (!text) return;
        // Bare session id without key=
        if (!text.includes('=') && !text.includes(';')) {
            jar.set('sessionid', text);
            return;
        }
        for (const part of text.split(';')) {
            const idx = part.indexOf('=');
            if (idx <= 0) continue;
            const key = part.slice(0, idx).trim();
            const val = part.slice(idx + 1).trim();
            if (key && val) jar.set(key, val);
        }
    };

    // Full cookie paste first, then session field, then csrf override.
    applyPair(cookies);
    applyPair(sessionId);
    if (csrfToken) jar.set('csrftoken', String(csrfToken).trim());

    const sid = jar.get('sessionid') || extractSessionId(sessionId);
    if (!sid) {
        throw new Error(
            'instagramSessionId is empty. Paste the sessionid cookie (or a full Cookie header) from a logged-in Instagram browser session.',
        );
    }
    jar.set('sessionid', sid);

    const userId = extractUserIdFromSession(sid);
    if (userId && !jar.has('ds_user_id')) jar.set('ds_user_id', userId);
    if (!jar.has('ig_did')) jar.set('ig_did', cryptoRandomUuid());
    if (!jar.has('mid')) jar.set('mid', randomMid());
    if (!jar.has('csrftoken')) jar.set('csrftoken', randomToken(32));

    return {
        cookieHeader: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
        sessionId: sid,
        csrfToken: jar.get('csrftoken'),
        userId: jar.get('ds_user_id') || userId,
    };
}

function cryptoRandomUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function randomMid() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let out = '';
    for (let i = 0; i < 28; i++) out += alphabet[(Math.random() * alphabet.length) | 0];
    return out;
}

function randomToken(len) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let out = '';
    for (let i = 0; i < len; i++) out += alphabet[(Math.random() * alphabet.length) | 0];
    return out;
}

/**
 * Convert any image buffer Instagram can display into a JPEG buffer.
 * Preserves an already-square 1080 canvas (does not re-crop the composed post).
 * @param {Buffer} imageBuffer
 */
export async function toInstagramJpeg(imageBuffer) {
    const image = sharp(imageBuffer).rotate();
    const meta = await image.metadata();
    const pipeline =
        meta.width === 1080 && meta.height === 1080
            ? image
            : image.resize(1080, 1080, { fit: 'cover', position: 'centre' });

    return pipeline
        .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toBuffer();
}

/**
 * @param {string} cookieHeader
 * @param {string} csrfToken
 */
function webHeaders(cookieHeader, csrfToken) {
    return {
        'User-Agent': USER_AGENT,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-CSRFToken': csrfToken,
        'X-IG-App-ID': '936619743392459',
        'X-IG-WWW-Claim': '0',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Instagram-AJAX': '1',
        Origin: IG_WEB,
        Referer: `${IG_WEB}/`,
        Cookie: cookieHeader,
    };
}

/**
 * Verify the browser session and return basic account info.
 * @param {{ cookieHeader: string, csrfToken: string }} opts
 */
export async function verifyWebSession({ cookieHeader, csrfToken }) {
    const response = await fetch(`${IG_WEB}/api/v1/accounts/edit/web_form_data/`, {
        method: 'GET',
        headers: webHeaders(cookieHeader, csrfToken),
        redirect: 'manual',
    });

    const text = await response.text();
    let data = null;
    try {
        data = JSON.parse(text);
    } catch {
        // ignore
    }

    if (!response.ok || data?.status === 'fail' || data?.message) {
        const detail = data?.message || text.slice(0, 200) || response.statusText;
        throw new Error(
            `Instagram session is invalid or expired (${response.status}): ${detail}. ` +
                'Copy a fresh sessionid (and ideally csrftoken) from an open Instagram browser tab.',
        );
    }

    const form = data?.form_data || data || {};
    const username = form.username || form.user?.username || null;
    const userId = form.user_id || form.user?.pk || null;

    if (!username && !userId) {
        // Fallback probe — homepage logged-in shared data is heavy; try edit_profile
        const probe = await fetch(`${IG_WEB}/accounts/edit/`, {
            headers: {
                ...webHeaders(cookieHeader, csrfToken),
                Accept: 'text/html',
            },
            redirect: 'manual',
        });
        if (probe.status === 302 || probe.status === 301) {
            const loc = probe.headers.get('location') || '';
            if (/login/i.test(loc)) {
                throw new Error(
                    'Instagram session is not logged in (redirected to login). Paste a fresh sessionid cookie.',
                );
            }
        }
        if (!probe.ok && probe.status !== 200) {
            throw new Error(`Could not verify Instagram session (HTTP ${probe.status}).`);
        }
    }

    log.info(`Instagram web session OK${username ? ` for @${username}` : ''}`);
    return { username, userId: userId ? String(userId) : null, raw: data };
}

/**
 * Upload JPEG bytes via Instagram rupload, then configure a feed post.
 * @param {{
 *   cookieHeader: string,
 *   csrfToken: string,
 *   jpeg: Buffer,
 *   caption: string,
 * }} opts
 */
async function uploadAndConfigure({ cookieHeader, csrfToken, jpeg, caption }) {
    const uploadId = `${Date.now()}`;
    const entityName = `fb_uploader_${uploadId}`;
    const ruploadParams = {
        media_type: 1,
        upload_id: uploadId,
        upload_media_height: 1080,
        upload_media_width: 1080,
        xsharing_user_ids: JSON.stringify([]),
        image_compression: JSON.stringify({
            lib_name: 'moz',
            lib_version: '3.1.m',
            quality: '92',
        }),
    };

    const uploadResponse = await fetch(`${IG_APP}/rupload_igphoto/${entityName}`, {
        method: 'POST',
        headers: {
            ...webHeaders(cookieHeader, csrfToken),
            'Content-Type': 'image/jpeg',
            'Content-Length': String(jpeg.length),
            'X-Entity-Name': entityName,
            'X-Entity-Length': String(jpeg.length),
            'X-Entity-Type': 'image/jpeg',
            Offset: '0',
            'X-Instagram-Rupload-Params': JSON.stringify(ruploadParams),
        },
        body: jpeg,
    });

    const uploadText = await uploadResponse.text();
    let uploadJson = null;
    try {
        uploadJson = JSON.parse(uploadText);
    } catch {
        // ignore
    }

    if (!uploadResponse.ok || uploadJson?.status === 'fail') {
        throw new Error(
            `Instagram photo upload failed (${uploadResponse.status}): ${
                uploadJson?.message || uploadText.slice(0, 300) || uploadResponse.statusText
            }`,
        );
    }

    const configureBody = new URLSearchParams({
        source_type: 'library',
        caption: caption || '',
        upload_id: uploadId,
        disable_comments: '0',
        like_and_view_counts_disabled: '0',
        igtv_share_preview_to_feed: '1',
        is_unified_video: '1',
        disable_oa_reuse: 'false',
        share_to_feed: '1',
    });

    const configureResponse = await fetch(`${IG_WEB}/api/v1/media/configure/`, {
        method: 'POST',
        headers: {
            ...webHeaders(cookieHeader, csrfToken),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: configureBody,
    });

    const configureText = await configureResponse.text();
    let configureJson = null;
    try {
        configureJson = JSON.parse(configureText);
    } catch {
        // ignore
    }

    if (!configureResponse.ok || configureJson?.status === 'fail' || !configureJson?.media) {
        throw new Error(
            `Instagram configure/publish failed (${configureResponse.status}): ${
                configureJson?.message || configureText.slice(0, 300) || configureResponse.statusText
            }`,
        );
    }

    const media = configureJson.media;
    const code = media.code || null;
    return {
        media,
        code,
        mediaId: media.id || media.pk ? String(media.id || media.pk) : null,
        postUrl: code ? `https://www.instagram.com/p/${code}/` : null,
        username: media.user?.username || null,
        userId: media.user?.pk ? String(media.user.pk) : null,
    };
}

/**
 * Publish a photo to the Instagram feed using browser session cookies.
 * @param {{
 *   sessionId: string,
 *   csrfToken?: string,
 *   cookies?: string,
 *   username?: string,
 *   imageBuffer: Buffer,
 *   caption: string,
 * }} opts
 */
export async function postPhotoToInstagram({
    sessionId,
    csrfToken = '',
    cookies = '',
    username = '',
    imageBuffer,
    caption,
}) {
    if (!imageBuffer?.length) {
        throw new Error('Cannot post to Instagram without an image buffer.');
    }

    const auth = buildCookieHeader({ sessionId, csrfToken, cookies });
    const account = await verifyWebSession({
        cookieHeader: auth.cookieHeader,
        csrfToken: auth.csrfToken,
    });

    const jpeg = await toInstagramJpeg(imageBuffer);
    log.info(
        `Publishing Instagram feed photo via web API${
            account.username || username ? ` as @${account.username || username}` : ''
        }…`,
    );

    const published = await uploadAndConfigure({
        cookieHeader: auth.cookieHeader,
        csrfToken: auth.csrfToken,
        jpeg,
        caption,
    });

    return {
        posted: true,
        username: published.username || account.username || username || null,
        userId: published.userId || account.userId || auth.userId || null,
        mediaId: published.mediaId,
        code: published.code,
        postUrl: published.postUrl,
        publishedAt: new Date().toISOString(),
        method: 'web-rupload',
    };
}
