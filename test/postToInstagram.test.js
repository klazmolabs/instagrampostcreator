import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractSessionId, extractUserIdFromSession } from '../src/postToInstagram.js';

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
