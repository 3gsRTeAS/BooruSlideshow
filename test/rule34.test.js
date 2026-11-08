const test = require('node:test');
const assert = require('node:assert');
const { loadApp, fakeSitesManager } = require('./helpers');

const app = loadApp();
const { SiteManagerRule34, SiteManagerFactory, SITE_RULE34, MEDIA_TYPE_VIDEO, MEDIA_TYPE_IMAGE } = app;

const post = (attrs) => '<post ' + Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ') + ' />';
const BASE = {
	id: '123', file_url: 'https://api-cdn.rule34.xxx/images/1/abc.jpg?123', preview_url: 'https://api-cdn.rule34.xxx/thumbnails/1/thumbnail_abc.jpg',
	width: '800', height: '600', score: '5', md5: 'abc', rating: 'e', tags: ' cat dog ', created_at: 'Sun Dec 21 12:00:00 +0000 2025'
};
const xml = (...posts) => `<?xml version="1.0" encoding="UTF-8"?><posts count="${posts.length}" offset="0">${posts.join('')}</posts>`;

function manager(model = { rule34UserId: '42', rule34ApiKey: 'SECRETKEY' })
{
	const sm = fakeSitesManager(model);
	const m = new SiteManagerRule34(sm, 100);
	return { m, sm };
}

test('factory creates the rule34 manager', () => {
	const m = SiteManagerFactory.createSiteManager(fakeSitesManager(), SITE_RULE34, 100);
	assert.ok(m instanceof SiteManagerRule34);
});

test('requires credentials and reports missing ones', () => {
	const { m } = manager({});
	assert.strictEqual(m.requiresCredentials(), true);
	assert.strictEqual(m.hasCredentials(), false);
	assert.strictEqual(m.buildPingRequestUrl(), null);
	assert.strictEqual(m.buildRequestUrl('cat', 1), null);
	assert.match(m.getMissingCredentialsMessage(), /API key and user ID/);
});

test('whitespace-only credentials count as missing', () => {
	const { m } = manager({ rule34UserId: '  ', rule34ApiKey: ' ' });
	assert.strictEqual(m.hasCredentials(), false);
});

test('request URL uses api host, 0-based pid, limit, encoded tags and credentials', () => {
	const { m } = manager({ rule34UserId: '42', rule34ApiKey: 'a&b=c' });
	const url = new URL(m.buildRequestUrl('cat rating:s sort:score', 3));
	assert.strictEqual(url.origin, 'https://api.rule34.xxx');
	assert.strictEqual(url.searchParams.get('page'), 'dapi');
	assert.strictEqual(url.searchParams.get('s'), 'post');
	assert.strictEqual(url.searchParams.get('q'), 'index');
	assert.strictEqual(url.searchParams.get('pid'), '2');
	assert.strictEqual(url.searchParams.get('limit'), '100');
	assert.strictEqual(url.searchParams.get('user_id'), '42');
	assert.strictEqual(url.searchParams.get('api_key'), 'a&b=c');
	// tag associations still apply (order/sort + rating)
	assert.strictEqual(url.searchParams.get('tags'), 'cat rating:safe sort:score');
});

test('first page is pid 0', () => {
	const { m } = manager();
	assert.strictEqual(new URL(m.buildRequestUrl('cat', 1)).searchParams.get('pid'), '0');
});

test('ping URL asks for one post with credentials', () => {
	const { m } = manager();
	const url = new URL(m.buildPingRequestUrl());
	assert.strictEqual(url.searchParams.get('limit'), '1');
	assert.strictEqual(url.searchParams.get('api_key'), 'SECRETKEY');
});

test('online detection', () => {
	const { m } = manager();
	assert.strictEqual(m.doesResponseTextIndicateOnline(xml(post(BASE))), true);
	assert.strictEqual(m.doesResponseTextIndicateOnline(xml()), false);
	assert.strictEqual(m.doesResponseTextIndicateOnline('Missing authentication. Go to api.rule34.xxx for more information'), false);
	assert.strictEqual(m.doesResponseTextIndicateOnline(''), false);
	assert.strictEqual(m.doesResponseTextIndicateOnline(undefined), false);
});

test('parses a post into a slide', () => {
	const { m } = manager();
	m.addSlides(xml(post(BASE)));
	assert.strictEqual(m.allUnsortedSlides.length, 1);
	const s = m.allUnsortedSlides[0];
	assert.strictEqual(s.siteId, SITE_RULE34);
	assert.strictEqual(s.id, '123');
	assert.strictEqual(s.fileUrl, BASE.file_url);
	assert.strictEqual(s.previewFileUrl, BASE.preview_url);
	assert.strictEqual(s.viewableWebsitePostUrl, 'https://rule34.xxx/index.php?page=post&s=view&id=123');
	assert.strictEqual(s.width, 800);
	assert.strictEqual(s.height, 600);
	assert.strictEqual(s.score, 5);
	assert.strictEqual(s.md5, 'abc');
	assert.strictEqual(s.mediaType, MEDIA_TYPE_IMAGE);
	assert.ok(!isNaN(s.date.getTime()));
	assert.strictEqual(m.hasExhaustedSearch, true); // 1 post < page limit 100
});

test('a full page is not treated as exhausted', () => {
	const { m } = manager();
	m.pageLimit = 2;
	m.addSlides(xml(post(BASE), post({ ...BASE, id: '124', md5: 'x' })));
	assert.strictEqual(m.hasExhaustedSearch, false);
});

test('webm detected even with a cache-busting query string', () => {
	const { m } = manager();
	m.addSlides(xml(post({ ...BASE, file_url: 'https://api-cdn.rule34.xxx/images/1/v.webm?999' })));
	assert.strictEqual(m.allUnsortedSlides[0].mediaType, MEDIA_TYPE_VIDEO);
});

test('swf/zip are skipped; unsupported media toggles respected', () => {
	const { m, sm } = manager();
	m.addSlides(xml(post({ ...BASE, file_url: 'https://x.rule34.xxx/a.swf' })));
	assert.strictEqual(m.allUnsortedSlides.length, 0);
	sm.model.includeWebms = false;
	m.addSlides(xml(post({ ...BASE, file_url: 'https://x.rule34.xxx/a.webm' })));
	assert.strictEqual(m.allUnsortedSlides.length, 0);
});

test('rating and blacklist filters apply', () => {
	const { m, sm } = manager();
	sm.model.includeExplicit = false; // safe only
	m.addSlides(xml(post(BASE)));
	assert.strictEqual(m.allUnsortedSlides.length, 0);
	sm.model.includeExplicit = true;
	sm.model.blacklist = 'dog';
	m.addSlides(xml(post(BASE)));
	assert.strictEqual(m.allUnsortedSlides.length, 0);
});

test('untrusted file URLs are rejected', () => {
	const { m } = manager();
	for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'http://insecure.example/a.jpg', 'https://user:pw@evil.example/a.jpg', 'blob:abc'])
	{
		m.addSlides(xml(post({ ...BASE, file_url: bad })));
	}
	assert.strictEqual(m.allUnsortedSlides.length, 0);
});

test('protocol-relative URLs are upgraded to https', () => {
	const { m } = manager();
	m.addSlides(xml(post({ ...BASE, file_url: '//wimg.rule34.xxx/images/1/a.jpg', preview_url: '//wimg.rule34.xxx/thumbnails/1/t.jpg' })));
	assert.strictEqual(m.allUnsortedSlides[0].fileUrl, 'https://wimg.rule34.xxx/images/1/a.jpg');
	assert.strictEqual(m.allUnsortedSlides[0].previewFileUrl, 'https://wimg.rule34.xxx/thumbnails/1/t.jpg');
});

test('a hostile post id cannot break out of the post URL', () => {
	const { m } = manager();
	m.addSlides(xml(post({ ...BASE, id: '1&amp;x=javascript:alert(1)' })));
	const url = new URL(m.allUnsortedSlides[0].viewableWebsitePostUrl);
	assert.strictEqual(url.origin, 'https://rule34.xxx');
	assert.strictEqual(url.searchParams.get('id'), '1&x=javascript:alert(1)');
});

test('missing/invalid date falls back instead of producing Invalid Date', () => {
	const { m } = manager();
	m.addSlides(xml(post({ ...BASE, created_at: 'garbage', change: '1700000000' })));
	assert.strictEqual(m.allUnsortedSlides[0].date.getTime(), 1700000000 * 1000);
	m.addSlides(xml(post({ ...BASE, id: '5', created_at: 'garbage' })));
	assert.strictEqual(m.allUnsortedSlides[1].date.getTime(), 0);
});

test('posts missing required attributes are skipped', () => {
	const { m } = manager();
	m.addSlides(xml('<post id="1" tags="a" />'));
	assert.strictEqual(m.allUnsortedSlides.length, 0);
});

test('auth failure: stops searching, warns, never echoes credentials', () => {
	const { m, sm } = manager();
	m.addSlides('Missing authentication. Go to api.rule34.xxx for more information');
	assert.strictEqual(m.ranIntoErrorWhileSearching, true);
	assert.strictEqual(m.hasntExhaustedSearch() , false);
	assert.strictEqual(sm.warnings.length, 1);
	assert.match(sm.warnings[0], /rejected the API key/);
	assert.ok(!sm.warnings.join().includes('SECRETKEY'));
});

test('malformed / unexpected body is an error, not a crash', () => {
	const { m, sm } = manager();
	m.addSlides('<html><body>Cloudflare</body></html>');
	m.addSlides('<<<not xml');
	m.addSlides('');
	assert.strictEqual(m.allUnsortedSlides.length, 0);
	assert.strictEqual(m.ranIntoErrorWhileSearching, true);
	assert.match(sm.warnings[0], /unexpected response/);
});

test('empty result set is a clean end of search', () => {
	const { m, sm } = manager();
	m.addSlides(xml());
	assert.strictEqual(m.hasExhaustedSearch, true);
	assert.strictEqual(m.ranIntoErrorWhileSearching, false);
	assert.strictEqual(sm.warnings.length, 0);
});

test('credentials never appear in error messages', () => {
	const { m, sm } = manager();
	m.handleGeneralError(m.buildRequestUrl('cat', 1));
	assert.ok(!sm.warnings[0].includes('SECRETKEY'));
	assert.ok(sm.warnings[0].includes('api_key=***'));
	m.handleErrorFromSiteResponse(JSON.stringify({ message: 'bad api_key=SECRETKEY here SECRETKEY' }), 403);
	assert.ok(!sm.warnings[1].includes('SECRETKEY'));
});

test('pingStatus without credentials still calls back (site shown offline)', () => {
	const { m } = manager({});
	let called = null;
	m.pingStatus((sm) => { called = sm; });
	assert.strictEqual(called, m);
	assert.strictEqual(m.isOnline, false);
});
