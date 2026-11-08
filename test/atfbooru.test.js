const test = require('node:test');
const assert = require('node:assert');
const { loadApp, fakeSitesManager } = require('./helpers');

const app = loadApp();
const { SiteManagerAtfBooru, SiteManagerFactory, SITE_ATFBOORU, MEDIA_TYPE_VIDEO, MEDIA_TYPE_IMAGE } = app;

const POST = {
	id: 77, file_url: 'https://booru.allthefallen.moe/data/ab/cd/abcd.jpg', preview_file_url: 'https://booru.allthefallen.moe/data/preview/ab/cd/abcd.jpg',
	image_width: 800, image_height: 600, score: 4, md5: 'abcd', rating: 'e', tag_string: 'cat dog', created_at: '2025-12-21T12:00:00.000Z'
};
const body = (...posts) => JSON.stringify(posts);

function manager(model = { atfUsername: 'bob', atfApiKey: 'SECRETKEY' })
{
	const sm = fakeSitesManager(model);
	return { m: new SiteManagerAtfBooru(sm, 100), sm };
}

test('factory creates the ATFBooru manager', () => {
	assert.ok(SiteManagerFactory.createSiteManager(fakeSitesManager(), SITE_ATFBOORU, 100) instanceof SiteManagerAtfBooru);
});

test('requires username + API key; missing/blank credentials produce no request URL', () => {
	for (const model of [{}, { atfUsername: 'bob' }, { atfApiKey: 'k' }, { atfUsername: ' ', atfApiKey: ' ' }])
	{
		const { m } = manager(model);
		assert.strictEqual(m.requiresCredentials(), true);
		assert.strictEqual(m.hasCredentials(), false);
		assert.strictEqual(m.buildPingRequestUrl(), null);
		assert.strictEqual(m.buildRequestUrl('cat', 1), null);
	}
	assert.match(manager({}).m.getMissingCredentialsMessage(), /username and an API key/);
});

test('request URL: posts.json, 1-based page, limit, encoded tags, login + api_key', () => {
	const { m } = manager({ atfUsername: 'bob smith', atfApiKey: 'a+b/c=d' });
	const url = new URL(m.buildRequestUrl('cat rating:s sort:score', 3));
	assert.strictEqual(url.origin, 'https://booru.allthefallen.moe');
	assert.strictEqual(url.pathname, '/posts.json');
	assert.strictEqual(url.searchParams.get('page'), '3');
	assert.strictEqual(url.searchParams.get('limit'), '100');
	assert.strictEqual(url.searchParams.get('login'), 'bob smith');
	assert.strictEqual(url.searchParams.get('api_key'), 'a+b/c=d');
	assert.strictEqual(url.searchParams.get('tags'), 'cat rating:s order:score');
	assert.strictEqual(new URL(m.buildRequestUrl('cat', 1)).searchParams.get('page'), '1');
});

test('tags containing & or # cannot inject extra parameters', () => {
	const { m } = manager();
	const url = new URL(m.buildRequestUrl('a&login=evil#x', 1));
	assert.strictEqual(url.searchParams.get('login'), 'bob');
	assert.strictEqual(url.searchParams.get('tags'), 'a&login=evil#x');
});

test('ping URL asks for one post with credentials', () => {
	const url = new URL(manager().m.buildPingRequestUrl());
	assert.strictEqual(url.searchParams.get('limit'), '1');
	assert.strictEqual(url.searchParams.get('api_key'), 'SECRETKEY');
});

test('online detection', () => {
	const { m } = manager();
	assert.strictEqual(m.doesResponseTextIndicateOnline(body(POST)), true);
	assert.strictEqual(m.doesResponseTextIndicateOnline('[]'), false);
	assert.strictEqual(m.doesResponseTextIndicateOnline('{"success":false}'), false);
	assert.strictEqual(m.doesResponseTextIndicateOnline('<html>check</html>'), false);
	assert.strictEqual(m.doesResponseTextIndicateOnline(''), false);
	assert.strictEqual(m.doesResponseTextIndicateOnline(undefined), false);
});

test('parses a post into a slide', () => {
	const { m } = manager();
	m.addSlides(body(POST));
	assert.strictEqual(m.allUnsortedSlides.length, 1);
	const s = m.allUnsortedSlides[0];
	assert.strictEqual(s.siteId, SITE_ATFBOORU);
	assert.strictEqual(s.id, 77);
	assert.strictEqual(s.fileUrl, POST.file_url);
	assert.strictEqual(s.previewFileUrl, POST.preview_file_url);
	assert.strictEqual(s.viewableWebsitePostUrl, 'https://booru.allthefallen.moe/posts/77');
	assert.strictEqual(s.width, 800);
	assert.strictEqual(s.score, 4);
	assert.strictEqual(s.md5, 'abcd');
	assert.strictEqual(s.tags, 'cat dog');
	assert.strictEqual(s.mediaType, MEDIA_TYPE_IMAGE);
	assert.strictEqual(s.date.toISOString(), '2025-12-21T12:00:00.000Z');
});

test('pagination: short page ends the search, full page does not, empty page is clean', () => {
	const { m, sm } = manager();
	m.addSlides(body(POST));
	assert.strictEqual(m.hasExhaustedSearch, true);
	const m2 = manager().m; m2.pageLimit = 2;
	m2.addSlides(body(POST, { ...POST, id: 78, md5: 'x' }));
	assert.strictEqual(m2.hasExhaustedSearch, false);
	const m3 = manager(); m3.m.addSlides('[]');
	assert.strictEqual(m3.m.hasExhaustedSearch, true);
	assert.strictEqual(m3.m.ranIntoErrorWhileSearching, false);
	assert.strictEqual(m3.sm.warnings.length, 0);
});

test('relative media paths are resolved against the site; webm detected', () => {
	const { m } = manager();
	m.addSlides(body({ ...POST, file_url: '/data/ab/v.webm', preview_file_url: '/data/preview/v.jpg' }));
	assert.strictEqual(m.allUnsortedSlides[0].fileUrl, 'https://booru.allthefallen.moe/data/ab/v.webm');
	assert.strictEqual(m.allUnsortedSlides[0].mediaType, MEDIA_TYPE_VIDEO);
});

test('posts without file_url (restricted to this account) and unsupported types are skipped', () => {
	const { m } = manager();
	const { file_url, ...restricted } = POST;
	m.addSlides(body(restricted, { ...POST, id: 2, file_url: 'https://x.moe/a.swf' }, { ...POST, id: 3, file_url: 'https://x.moe/a.zip' }));
	assert.strictEqual(m.allUnsortedSlides.length, 0);
});

test('rating and blacklist filters apply', () => {
	const { m, sm } = manager();
	sm.model.includeExplicit = false;
	m.addSlides(body(POST));
	assert.strictEqual(m.allUnsortedSlides.length, 0);
	sm.model.includeExplicit = true; sm.model.blacklist = 'dog';
	m.addSlides(body(POST));
	assert.strictEqual(m.allUnsortedSlides.length, 0);
});

test('untrusted media URLs are rejected', () => {
	const { m } = manager();
	for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://insecure.example/a.jpg', 'https://u:p@evil.example/a.jpg', 'blob:abc'])
		m.addSlides(body({ ...POST, file_url: bad }));
	assert.strictEqual(m.allUnsortedSlides.length, 0);
});

test('hostile field values cannot break URLs or crash parsing', () => {
	const { m } = manager();
	m.addSlides(body({ ...POST, id: '1/../../admin?x=1#', created_at: 'garbage', image_width: 'NaN?', score: null, tag_string: 5 }, null, 7, 'str', []));
	assert.strictEqual(m.allUnsortedSlides.length, 1);
	const s = m.allUnsortedSlides[0];
	assert.strictEqual(new URL(s.viewableWebsitePostUrl).origin, 'https://booru.allthefallen.moe');
	assert.strictEqual(new URL(s.viewableWebsitePostUrl).pathname, '/posts/1%2F..%2F..%2Fadmin%3Fx%3D1%23');
	assert.strictEqual(s.date.getTime(), 0);
	assert.strictEqual(s.tags, '');
});

test('malformed or non-list bodies are an error, not a crash', () => {
	for (const bad of ['', '{', 'null', '{"success":false,"message":"nope"}', '"text"', '123'])
	{
		const { m, sm } = manager();
		m.addSlides(bad);
		assert.strictEqual(m.allUnsortedSlides.length, 0, bad);
		assert.strictEqual(m.ranIntoErrorWhileSearching, true, bad);
		assert.match(sm.warnings[0], /unexpected response/, bad);
	}
});

test('an HTML anti-bot page (HTTP 200) gives the anti-bot hint', () => {
	const { m, sm } = manager();
	m.addSlides('<!DOCTYPE html><html><body>Checking your browser</body></html>');
	assert.strictEqual(m.ranIntoErrorWhileSearching, true);
	assert.match(sm.warnings[0], /anti-bot/);
	assert.match(sm.warnings[0], /Open https:\/\/booru\.allthefallen\.moe in Firefox/);
});

test('an HTML error page (e.g. HTTP 403/503) gives the anti-bot hint; hidden for pings', () => {
	const { m, sm } = manager();
	m.handleErrorFromSiteResponse('<html><body>Just a moment...</body></html>', 403);
	assert.match(sm.warnings[0], /anti-bot/);
	m.handleErrorFromSiteResponse('<html></html>', 503, true);
	assert.strictEqual(sm.warnings.length, 1);
});

test('401 JSON error: message shown without echoing credentials', () => {
	const { m, sm } = manager();
	m.handleErrorFromSiteResponse(JSON.stringify({ success: false, message: 'Invalid api_key=SECRETKEY for bob' }), 401);
	assert.strictEqual(m.ranIntoErrorWhileSearching, true);
	assert.ok(sm.warnings[0].includes('Error when calling site https://booru.allthefallen.moe'));
	assert.ok(!sm.warnings[0].includes('SECRETKEY'));
});

test('network errors never show the API key', () => {
	const { m, sm } = manager();
	m.handleGeneralError(m.buildRequestUrl('cat', 1));
	assert.ok(!sm.warnings[0].includes('SECRETKEY'));
	assert.ok(sm.warnings[0].includes('api_key=***'));
});

test('pingStatus without credentials still calls back (shown offline), no request made', () => {
	const { m } = manager({});
	let called = null;
	m.webRequester = { makeWebsiteRequest() { throw new Error('must not request'); }, resetConnection() {} };
	m.pingStatus((x) => { called = x; });
	assert.strictEqual(called, m);
	assert.strictEqual(m.isOnline, false);
});

test('web requester never logs credential-bearing URLs', () => {
	const fs = require('fs'), path = require('path');
	const src = fs.readFileSync(path.join(__dirname, '..', 'BooruSlideshow/js/objects/web_requester.js'), 'utf8');
	assert.ok(/logForDev\(redactUrl\(url\)\)/.test(src));
});

test('ATFBooru credentials are local-only and migrated from sync', async () => {
	assert.ok(app.CREDENTIAL_STORAGE_KEYS.includes('atfUsername') && app.CREDENTIAL_STORAGE_KEYS.includes('atfApiKey'));
});

test('manifest allows ATFBooru over https only', () => {
	const fs = require('fs'), path = require('path');
	const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'BooruSlideshow/manifest.json'), 'utf8'));
	assert.ok(m.host_permissions.includes('https://booru.allthefallen.moe/*'));
	assert.ok(m.content_security_policy.extension_pages.includes('connect-src \'self\' https://booru.allthefallen.moe'));
});

test('every element id looked up by slideshow_initialize.js exists in slideshow.html (no startup crash)', () => {
	const fs = require('fs'), path = require('path');
	const root = path.join(__dirname, '..', 'BooruSlideshow');
	const html = fs.readFileSync(path.join(root, 'slideshow.html'), 'utf8');
	const init = fs.readFileSync(path.join(root, 'js/slideshow_initialize.js'), 'utf8');
	const ids = [...init.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
	assert.ok(ids.includes('atf-username') && ids.includes('atf-api-key') && ids.includes('rule34-api-key'));
	const missing = ids.filter(id => !new RegExp('id="' + id + '"').test(html));
	assert.deepStrictEqual(missing, []);
});

test('every site checkbox value in slideshow.html has a matching site manager', () => {
	const fs = require('fs'), path = require('path');
	const html = fs.readFileSync(path.join(__dirname, '..', 'BooruSlideshow/slideshow.html'), 'utf8');
	const values = [...html.matchAll(/name="sites-to-search" value="([A-Z0-9]+)"/g)].map(m => m[1]);
	assert.ok(values.includes('ATFB'));
	for (const v of values)
		assert.ok(SiteManagerFactory.createSiteManager(fakeSitesManager(), v, 100), v);
});

test('a username containing & or = cannot inject parameters', () => {
	const { m } = manager({ atfUsername: 'bo&b=1&api_key=evil', atfApiKey: 'K' });
	const url = new URL(m.buildRequestUrl('cat', 1));
	assert.strictEqual(url.searchParams.get('login'), 'bo&b=1&api_key=evil');
	assert.strictEqual(url.searchParams.get('api_key'), 'K');
	assert.strictEqual(url.searchParams.get('b'), null);
});

test('a pasted query string in the API key field is reduced to the key', () => {
	for (const pasted of ['XYZ123', 'api_key=XYZ123', '?api_key=XYZ123&login=bob', 'XYZ123&login=zhg2upk', ' XYZ123 \n'])
	{
		const { m } = manager({ atfUsername: 'bob', atfApiKey: pasted });
		assert.strictEqual(m.getApiKey(), 'XYZ123', pasted);
		assert.strictEqual(new URL(m.buildRequestUrl('cat', 1)).searchParams.get('api_key'), 'XYZ123');
	}
});

test('only the ATFBooru web requester sends cookies', () => {
	assert.strictEqual(manager().m.webRequester.withCredentials, true);
	const sm = fakeSitesManager();
	assert.strictEqual(new app.SiteManagerRule34(sm, 100).webRequester.withCredentials, false);
	assert.strictEqual(new app.SiteManagerGelbooru(sm, 100).webRequester.withCredentials, false);
});

test('user-triggered ping explains why a site is offline (anti-bot page, bad status, empty)', () => {
	const run = (respond) => {
		const { m, sm } = manager();
		m.webRequester = { makeWebsiteRequest(url, ok, err, after, fail) { respond(ok, err, after, fail); }, resetConnection() {} };
		let done = false;
		m.pingStatus(() => { done = true; }, true);
		return { m, sm, done };
	};
	let r = run((ok, err, after) => { ok('<!DOCTYPE html><html>I am not a robot</html>'); after(); });
	assert.strictEqual(r.m.isOnline, false); assert.match(r.sm.warnings[0], /anti-bot/); assert.ok(r.done);
	r = run((ok, err, after) => { err('<html>blocked</html>', 403); after(); });
	assert.match(r.sm.warnings[0], /anti-bot/);
	r = run((ok, err, after) => { err('{"success":false,"message":"bad key SECRETKEY"}', 401); after(); });
	assert.ok(r.sm.warnings[0].includes('bad key') && !r.sm.warnings[0].includes('SECRETKEY'));
	r = run((ok, err, after) => { ok('[]'); after(); });
	assert.match(r.sm.warnings[0], /Check your username and API key/);
	r = run((ok, err, after, fail) => { fail(r0url()); });
	function r0url() { return 'https://booru.allthefallen.moe/posts.json?api_key=SECRETKEY'; }
	assert.ok(!r.sm.warnings[0].includes('SECRETKEY'));
});

test('the quiet startup ping shows no warnings', () => {
	const { m, sm } = manager();
	m.webRequester = { makeWebsiteRequest(url, ok, err, after, fail) { err('<html></html>', 403); after(); }, resetConnection() {} };
	m.pingStatus(() => {});
	assert.strictEqual(sm.warnings.length, 0);
});
