import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toHashtag, buildHashtags, formatInstagramCaption } from '../src/formatInstagram.js';
import { pickArticle, extractArticlesFromHomepage } from '../src/scrape.js';

describe('toHashtag', () => {
    it('converts phrases to CamelCase hashtags', () => {
        assert.equal(toHashtag('New Jersey'), '#NewJersey');
        assert.equal(toHashtag('#food pantry'), '#FoodPantry');
        assert.equal(toHashtag('Craig Guy'), '#CraigGuy');
    });

    it('returns null for empty input', () => {
        assert.equal(toHashtag(''), null);
        assert.equal(toHashtag('   '), null);
    });
});

describe('formatInstagramCaption', () => {
    const article = {
        headline: 'Test Headline About Bayonne',
        summary: 'A short summary of the story for Instagram.',
        keyPoints: ['Point one is important', 'Point two adds context'],
        keywords: ['Bayonne', 'Hudson County'],
        city: 'Bayonne',
        source: 'River View Observer',
        category: 'Community',
        articleUrl: 'https://njnewshub.com/bayonne/test-slug',
    };

    it('builds a caption with headline, summary, bullets, link, and hashtags', () => {
        const { caption, hashtags, characterCount } = formatInstagramCaption(article);
        assert.match(caption, /Test Headline About Bayonne/);
        assert.match(caption, /A short summary/);
        assert.match(caption, /• Point one/);
        assert.match(caption, /Read more: https:\/\/njnewshub.com\/bayonne\/test-slug/);
        assert.match(caption, /Via NJ News Hub/);
        assert.ok(hashtags.includes('#Bayonne'));
        assert.ok(hashtags.includes('#NewJersey'));
        assert.equal(characterCount, caption.length);
    });

    it('can omit key points', () => {
        const { caption } = formatInstagramCaption(article, { includeKeyPoints: false });
        assert.doesNotMatch(caption, /• Point one/);
    });
});

describe('pickArticle', () => {
    const articles = [
        { headline: 'Featured', slug: 'a' },
        { headline: 'Latest', slug: 'b' },
        { headline: 'Other', slug: 'c' },
    ];

    it('picks featured and latest', () => {
        assert.equal(pickArticle(articles, 'featured').headline, 'Featured');
        assert.equal(pickArticle(articles, 'latest').headline, 'Latest');
    });

    it('throws when empty', () => {
        assert.throws(() => pickArticle([]), /No articles found/);
    });
});

describe('extractArticlesFromHomepage', () => {
    it('parses embedded article JSON from HTML', () => {
        const liveLike = `"article":{"id":"1","slug":"food-pantry","headline":"Food Pantry Opens","ai_summary":"Summary here","image_url":"https://example.com/a.jpg","image_alt":"alt","key_points":["One"],"keywords":["Bayonne"],"cities":{"name":"Bayonne","slug":"bayonne"},"categories":{"name":"Community"},"sources":{"name":"RVO"}}`;
        const articles = extractArticlesFromHomepage(liveLike);
        assert.equal(articles.length, 1);
        assert.equal(articles[0].headline, 'Food Pantry Opens');
        assert.equal(articles[0].articleUrl, 'https://njnewshub.com/bayonne/food-pantry');
        assert.equal(articles[0].city, 'Bayonne');
        assert.deepEqual(articles[0].keyPoints, ['One']);
    });

    it('parses escaped Next.js flight-data article JSON', () => {
        const escaped =
            'self.__next_f.push([1,"{\\"article\\":{\\"id\\":\\"1\\",\\"slug\\":\\"food-pantry\\",\\"headline\\":\\"Food Pantry Opens\\",\\"ai_summary\\":\\"Summary here\\",\\"image_url\\":\\"https://example.com/a.jpg\\",\\"key_points\\":[\\"One\\"],\\"keywords\\":[\\"Bayonne\\"],\\"cities\\":{\\"name\\":\\"Bayonne\\",\\"slug\\":\\"bayonne\\"},\\"categories\\":{\\"name\\":\\"Community\\"},\\"sources\\":{\\"name\\":\\"RVO\\"}}}"]';
        const articles = extractArticlesFromHomepage(escaped);
        assert.equal(articles.length, 1);
        assert.equal(articles[0].headline, 'Food Pantry Opens');
        assert.equal(articles[0].source, 'RVO');
    });
});

describe('buildHashtags', () => {
    it('dedupes and limits tags', () => {
        const tags = buildHashtags(
            { keywords: ['New Jersey', 'Bayonne'], city: 'Bayonne', category: 'Community' },
            ['NewJersey', 'ExtraTag'],
        );
        assert.ok(tags.includes('#NewJersey'));
        assert.ok(tags.includes('#Bayonne'));
        assert.ok(tags.includes('#ExtraTag'));
        assert.equal(tags.length, new Set(tags).size);
    });
});
