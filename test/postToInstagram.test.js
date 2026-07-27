import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    extractSessionId,
    extractUserIdFromSession,
    extractCookieValue,
    buildCookieHeader,
} from '../src/postToInstagram.js';

describe('extractSessionId', () => {
    it('accepts a bare session id', () => {
        assert.equal(extractSessionId('123%3Aabc%3A12'), '123%3Aabc%3A12');
    });

    it('strips sessionid= prefix', () => {
        assert.equal(extractSessionId('sessionid=123%3Aabc%3A12'), '123%3Aabc%3A12');
    });

    it('extracts sessionid from a full cookie header', () => {
        const header =
            'mid=X; sessionid=987654%3Atoken%3A26; ds_user_id=987654; csrftoken=abc';
        assert.equal(extractSessionId(header), '987654%3Atoken%3A26');
    });

    it('returns empty for blank input', () => {
        assert.equal(extractSessionId(''), '');
        assert.equal(extractSessionId('   '), '');
    });
});

describe('extractUserIdFromSession', () => {
    it('reads numeric user id from encoded session', () => {
        assert.equal(extractUserIdFromSession('987654%3Atoken%3A26'), '987654');
    });

    it('reads numeric user id from decoded session', () => {
        assert.equal(extractUserIdFromSession('987654:token:26'), '987654');
    });

    it('returns null when user id is missing', () => {
        assert.equal(extractUserIdFromSession('not-a-session'), null);
    });
});

describe('buildCookieHeader', () => {
    it('builds cookie header and derives ds_user_id + csrftoken', () => {
        const auth = buildCookieHeader({ sessionId: '111%3Asecret%3A1', csrfToken: 'csrf123' });
        assert.match(auth.cookieHeader, /sessionid=111%3Asecret%3A1/);
        assert.match(auth.cookieHeader, /ds_user_id=111/);
        assert.match(auth.cookieHeader, /csrftoken=csrf123/);
        assert.equal(auth.userId, '111');
    });

    it('parses a full cookie paste', () => {
        const auth = buildCookieHeader({
            sessionId: '',
            cookies: 'sessionid=222%3Ax%3A2; csrftoken=tok; ds_user_id=222; mid=abc',
        });
        assert.equal(auth.sessionId, '222%3Ax%3A2');
        assert.equal(auth.csrfToken, 'tok');
        assert.match(auth.cookieHeader, /mid=abc/);
    });
});

describe('extractCookieValue', () => {
    it('reads named cookies', () => {
        assert.equal(extractCookieValue('a=1; csrftoken=zzz; b=2', 'csrftoken'), 'zzz');
    });
});
