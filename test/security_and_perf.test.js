const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, fakeSitesManager, ROOT } = require('./helpers');

const app = loadApp();

// ---------- helpers ----------
test('sanitizeHttpsUrl accepts only plain https URLs', () => {
	const f = app.sanitizeHttpsUrl;
	assert.strictEqual(f('https://a.example/x.png'), 'https://a.example/x.png');
	assert.strictEqual(f('//a.example/x.png'), 'https://a.example/x.png');
	assert.strictEqual(f('/images/x.png', 'https://site.example'), 'https://site.example/images/x.png');
	for (const bad of [null, undefined, 5, '', '  ', 'http://a.example', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///etc/passwd', 'https://u:p@a.example/', 'ftp://a.example', 'not a url'])
		assert.strictEqual(f(bad), null, String(bad));
});

test('redactUrl masks credential parameters only', () => {
	assert.strictEqual(
		app.redactUrl('https://x/index.php?tags=cat&api_key=S3CR3T&user_id=42&login=bob&key=k#h'),
		'https://x/index.php?tags=cat&api_key=***&user_id=***&login=***&key=***#h');
});

test('download filenames cannot escape the bs/ folder', () => {
	const f = app.buildDownloadFilename;
	for (const url of ['https://x/a/../../etc/passwd', 'https://x/..%2f..%2fevil.exe?1', 'https://x/', 'https://x/%E0%A4%A.png', 'https://x/a\\b.png'])
	{
		const name = f(url);
		assert.ok(name.startsWith('bs/'));
		assert.ok(!name.slice(3).includes('/'), name);
		assert.ok(!name.slice(3).includes('\\'), name);
		assert.ok(!name.slice(3).startsWith('.'), name);
	}
	assert.strictEqual(f('https://x/img/abc.webm?123'), 'bs/abc.webm');
});

// ---------- rendering ----------
test('remote tags are rendered as text, never HTML', () => {
	const doc = app.window.document;
	const tags = doc.createElement('div');
	tags.style.display = 'none';
	const evil = '<img src=x onerror="window.__pwned=1"> <b>bold</b>';
	const fake = { uiElements: { tags }, _model: { getCurrentSlide: () => ({ tags: evil }) } };

	app.SlideshowView.prototype.toggleTags.call(fake);
	assert.strictEqual(tags.style.display, 'block');
	assert.strictEqual(tags.textContent, evil);
	assert.strictEqual(tags.children.length, 0);
	assert.strictEqual(app.window.__pwned, undefined);

	app.SlideshowView.prototype.toggleTags.call(fake);
	assert.strictEqual(tags.style.display, 'none');
});

test('toggleTags copes with a slide that has no tags', () => {
	const tags = app.window.document.createElement('div');
	tags.style.display = 'none';
	const fake = { uiElements: { tags }, _model: { getCurrentSlide: () => ({}) } };
	app.SlideshowView.prototype.toggleTags.call(fake);
	assert.strictEqual(tags.textContent, '');
});

test('warning/info messages are text, not HTML', () => {
	const doc = app.window.document;
	const el = doc.createElement('p');
	const fake = { uiElements: { warningMessage: el, infoMessage: el } };
	app.SlideshowView.prototype.displayWarningMessage.call(fake, '<img src=x onerror=1>');
	assert.strictEqual(el.children.length, 0);
	assert.strictEqual(el.textContent, '<img src=x onerror=1>');
});

test('no innerHTML assignments remain in the extension source', () => {
	const dir = path.join(ROOT, 'js');
	const offenders = [];
	(function walk(d) {
		for (const e of fs.readdirSync(d, { withFileTypes: true }))
		{
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (/\.js$/.test(e.name) && /\.innerHTML\s*=/.test(fs.readFileSync(p, 'utf8'))) offenders.push(p);
		}
	})(dir);
	assert.deepStrictEqual(offenders, []);
});

// ---------- all sites go through URL validation ----------
test('every site manager routes slides through pushSlideIfSafe', () => {
	const dir = path.join(ROOT, 'js/objects/site_managers');
	for (const f of fs.readdirSync(dir))
		assert.ok(!/allUnsortedSlides\.push\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')), f);
});

test('safebooru uses the real preview URL for thumbnails', () => {
	const sm = fakeSitesManager();
	const m = new app.SiteManagerSafebooru(sm, 100);
	const xml = '<posts><post id="1" file_url="//safebooru.org/images/1/a.jpg" preview_url="//safebooru.org/thumbnails/1/thumbnail_a.jpg" tags="x" width="1" height="1" created_at="Sun Dec 21 12:00:00 +0000 2025" score="0" md5="m" /></posts>';
	m.addSlides(xml);
	assert.strictEqual(m.allUnsortedSlides[0].previewFileUrl, 'https://safebooru.org/thumbnails/1/thumbnail_a.jpg');
	assert.strictEqual(m.allUnsortedSlides[0].fileUrl, 'https://safebooru.org/images/1/a.jpg');
});

test('gelbooru keeps its URL format (regression)', () => {
	const sm = fakeSitesManager({ gelbUserId: '7', gelbApiKey: 'K' });
	const m = new app.SiteManagerGelbooru(sm, 100);
	const url = new URL(m.buildRequestUrl('cat', 2));
	assert.strictEqual(url.origin, 'https://gelbooru.com');
	assert.strictEqual(url.searchParams.get('pid'), '1');
	assert.strictEqual(url.searchParams.get('user_id'), '7');
	assert.strictEqual(url.searchParams.get('api_key'), 'K');
	assert.strictEqual(m.requiresCredentials(), false);
});

// ---------- blacklist ----------
test('model blacklist: exact tag match, ignores empty blacklist, picks up edits', () => {
	const model = Object.create(app.SlideshowModel.prototype);
	model.blacklist = '';
	assert.strictEqual(model.areSomeTagsAreBlacklisted('a b c'), false);
	model.blacklist = 'dog  upside_down\nfoo';
	assert.strictEqual(model.areSomeTagsAreBlacklisted('cat dog'), true);
	assert.strictEqual(model.areSomeTagsAreBlacklisted('hotdog cat'), false);
	assert.strictEqual(model.areSomeTagsAreBlacklisted('x foo'), true);
	model.blacklist = 'cat';
	assert.strictEqual(model.areSomeTagsAreBlacklisted('dog'), false);
	assert.strictEqual(model.areSomeTagsAreBlacklisted(''), false);
	assert.strictEqual(model.areSomeTagsAreBlacklisted(null), false);
});

test('model reports selected sites that lack credentials', () => {
	const model = Object.create(app.SlideshowModel.prototype);
	const sm = fakeSitesManager({ rule34UserId: '', rule34ApiKey: '' });
	const r34 = app.SiteManagerFactory.createSiteManager(sm, app.SITE_RULE34, 100);
	const safe = new app.SiteManagerSafebooru(sm, 100);
	model.sitesManager = { siteManagers: [r34, safe] };
	model.sitesToSearch = { [app.SITE_RULE34]: true, [app.SITE_SAFEBOORU]: true };
	assert.deepStrictEqual(model.getSelectedSitesMissingCredentials().map(s => s.id), [app.SITE_RULE34]);
	model.sitesToSearch[app.SITE_RULE34] = false;
	assert.deepStrictEqual(model.getSelectedSitesMissingCredentials(), []);
});

// ---------- slide preloading ----------
class FakeImage
{
	set src(v) { setTimeout(() => (/fail/.test(v) ? this.onerror : this.onload)?.call(this), 0); }
}

test('a failed image preload is cleaned up and still fires the callback', async () => {
	const a = loadApp({ Image: FakeImage });
	const slide = new a.Slide('SAFE', 1, 'https://x/fail.jpg', '', 'https://x', 1, 1, new Date(), 0, a.MEDIA_TYPE_IMAGE, 'm', 't');
	let called = 0;
	slide.addCallback(() => called++);
	slide.preload();
	await new Promise(r => setTimeout(r, 10));
	assert.strictEqual(called, 1);
	assert.strictEqual(slide.hasFailed, true);
	assert.strictEqual(slide.isPreloaded, false);
	assert.strictEqual(slide.isPreloading, false);
	assert.strictEqual(slide.preloadingImage, null);
	slide.preload(); // does not retry forever
	assert.strictEqual(slide.isPreloading, false);
});

test('a successful image preload releases its Image object', async () => {
	const a = loadApp({ Image: FakeImage });
	const slide = new a.Slide('SAFE', 1, 'https://x/ok.jpg', '', 'https://x', 1, 1, new Date(), 0, a.MEDIA_TYPE_IMAGE, 'm', 't');
	slide.preload();
	await new Promise(r => setTimeout(r, 10));
	assert.strictEqual(slide.isPreloaded, true);
	assert.strictEqual(slide.preloadingImage, null);
});

test('only the next few videos are preloaded, images keep the full window', () => {
	const sm = new app.SitesManager({ view: null }, 20, 10);
	const mk = (i, type) => new app.Slide('SAFE', i, 'https://x/' + i, '', 'https://x', 1, 1, new Date(), 0, type, 'm' + i, 't');
	const preloaded = [];
	const slides = [];
	for (let i = 0; i < 6; i++) { const s = mk(i, app.MEDIA_TYPE_VIDEO); s.preload = function () { preloaded.push(this.id); this.isPreloaded = true; }; slides.push(s); }
	sm.allSortedSlides = slides;
	sm.currentSlideNumber = 1; // next slides are indexes 1..5
	for (let n = 0; n < 6; n++) sm.preloadNextUnpreloadedSlideIfInRange();
	assert.deepStrictEqual(preloaded, [1, 2]);
});

// ---------- storage ----------
function fakeChrome({ sync = {}, local = {} })
{
	const area = (store) => ({
		get(keys, cb) { const r = {}; for (const k of keys) if (k in store) r[k] = store[k]; cb(r); },
		set(obj) { Object.assign(store, obj); },
		remove(keys) { for (const k of keys) delete store[k]; }
	});
	return { runtime: {}, storage: { sync: area(sync), local: area(local) } };
}

test('credentials migrate from synced to local storage and are removed from sync', async () => {
	const sync = { secondsPerSlide: 9, rule34ApiKey: 'K', rule34UserId: '1', gelbApiKey: 'G' };
	const local = {};
	const a = loadApp({ chrome: fakeChrome({ sync, local }) });
	const loader = new a.DataLoader({});
	const result = await loader.getUserSettingsFromBrowser();
	assert.strictEqual(result.secondsPerSlide, 9);
	assert.strictEqual(result.rule34ApiKey, 'K');
	assert.deepStrictEqual({ ...local }, { rule34ApiKey: 'K', rule34UserId: '1', gelbApiKey: 'G' });
	assert.ok(!('rule34ApiKey' in sync) && !('gelbApiKey' in sync));
	assert.strictEqual(sync.secondsPerSlide, 9); // ordinary settings untouched
});

test('local credentials win over stale synced ones', async () => {
	const sync = { e621ApiKey: 'old' };
	const local = { e621ApiKey: 'new' };
	const a = loadApp({ chrome: fakeChrome({ sync, local }) });
	const result = await new a.DataLoader({}).getUserSettingsFromBrowser();
	assert.strictEqual(result.e621ApiKey, 'new');
	assert.strictEqual(local.e621ApiKey, 'new');
	assert.ok(!('e621ApiKey' in sync));
});

test('favorites saved to local storage are the ones loaded', async () => {
	const items = [{ siteId: 'SAFE', id: 1, md5: 'm', tags: 'a' }];
	const a = loadApp({ chrome: fakeChrome({ sync: {}, local: { personalListItems: items } }) });
	const result = await new a.DataLoader({}).getUserSettingsFromBrowser();
	assert.deepStrictEqual(result.personalListItems, items);
});

test('credentials are saved to local, never to sync', () => {
	const sync = {}, local = {};
	const a = loadApp({ chrome: fakeChrome({ sync, local }) });
	const model = { rule34ApiKey: 'K', rule34UserId: '1', gelbApiKey: 'G', gelbUserId: '2', e621ApiKey: 'E', e621Login: 'me', derpibooruApiKey: 'D', atfUsername: 'u', atfApiKey: 'A' };
	const loader = new a.DataLoader(model);
	loader.saveRule34ApiKey(); loader.saveRule34UserId(); loader.saveGelbApiKey(); loader.saveGelbUserId();
	loader.saveE621ApiKey(); loader.saveE621Login(); loader.saveDerpibooruApiKey();
	loader.saveAtfUsername(); loader.saveAtfApiKey();
	assert.deepStrictEqual(Object.keys(sync), []);
	assert.deepStrictEqual(Object.keys(local).sort(), [...a.CREDENTIAL_STORAGE_KEYS].sort());
});

// ---------- manifest ----------
test('manifest: Firefox MV3, minimal permissions, CSP', () => {
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
	assert.strictEqual(m.manifest_version, 3);
	assert.ok(parseInt(m.browser_specific_settings.gecko.strict_min_version) >= 113);
	assert.ok(!m.permissions.includes('webRequest'));
	assert.ok(m.host_permissions.includes('https://api.rule34.xxx/*'));
	assert.ok(m.host_permissions.every(h => h.startsWith('https://')));
	const csp = m.content_security_policy.extension_pages;
	assert.match(csp, /script-src 'self'/);
	assert.ok(!/unsafe-/.test(csp));
	// every host the XHR layer talks to must be allowed by connect-src
	for (const host of ['danbooru.donmai.us', 'derpibooru.org', 'e621.net', 'gelbooru.com', 'konachan.com', 'api.rule34.xxx', 'safebooru.org', 'xbooru.com', 'yande.re'])
		assert.ok(csp.includes('https://' + host), host);
});

test('every script referenced by the HTML pages exists', () => {
	for (const page of ['slideshow.html', 'personal_list.html', 'popup.html'])
	{
		const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
		for (const [, src] of html.matchAll(/<script src="([^"]+)"/g))
			assert.ok(fs.existsSync(path.join(ROOT, src)), page + ' -> ' + src);
	}
});
