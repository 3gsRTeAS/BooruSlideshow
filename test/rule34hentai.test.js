// NOTE: HTML fixtures here are SYNTHETIC, built from the URL/title formats observed on rule34hentai.net
// and stock Shimmie 2.9 markup. They are not captures of the live site.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, fakeSitesManager, ROOT } = require('./helpers');

const app = loadApp();
const { Rule34HentaiSearch: S, Rule34HentaiParser: P, Rule34HentaiFetcher, Rule34HentaiRequester, SiteManagerRule34Hentai, SiteManagerFactory, SITE_RULE34HENTAI } = app;
const deq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
const MD5 = 'a'.repeat(32), MD5B = 'b'.repeat(32);

const thumb = (id, md5, title) => `<a href="/post/view/${id}" title="${title}"><img src="https://rule34hentai.net/_thumbs/${md5}/thumb.jpg" alt="${title}"></a>`;
const listHtml = (grid, extra = '') => `<html><body>${extra}<div id="image-list">${grid}</div></body></html>`;
const detailHtml = (o = {}) => `<html><body><section id="Imagemain"><img id="main_image" src="${o.src || `https://rule34hentai.net/_images/${MD5}/1%20-%20x.jpg`}" data-width="800" data-height="600"></section>
<div>Rating: ${o.rating || 'Explicit'}</div><div>Current Score: ${o.score ?? 7}</div><time datetime="2024-05-06T07:08:09Z"></time>
<span class="tag_name">cat girl</span><span class="tag_name">dog</span></body></html>`;

test('parseTitle: image, video, empty tags, garbage', () => {
	deq(P.parseTitle('a b // 1920x1080 // 1.5MB // jpg'), { tags: 'a b', width: 1920, height: 1080, durationSeconds: null, sizeText: '1.5MB', ext: 'jpg' });
	const v = P.parseTitle('x // 640x480, 47.9s // 39.6MB // mp4');
	assert.strictEqual(v.durationSeconds, 47.9); assert.strictEqual(v.ext, 'mp4');
	assert.strictEqual(P.parseTitle(' // 10x10 // 5KB // png').tags, '');
	assert.strictEqual(P.parseTitle('nonsense'), null);
});

test('parseList: grid only (not Featured), dedupes, rejects foreign thumbs', () => {
	const html = listHtml(thumb(1, MD5, 'cat // 100x200 // 1MB // jpg') + thumb(1, MD5, 'cat // 100x200 // 1MB // jpg') +
		`<a href="/post/view/3"><img src="https://evil.example/_thumbs/${MD5B}/thumb.jpg"></a>`,
		`<div id="featured">${thumb(99, MD5B, 'f // 1x1 // 1KB // jpg')}</div>`);
	const r = P.parseList(html);
	deq(r.posts.map(p => p.id), ['1', '3']);
	assert.strictEqual(r.posts[0].md5, MD5); assert.strictEqual(r.posts[0].tags, 'cat'); assert.strictEqual(r.posts[0].width, 100);
	assert.strictEqual(r.posts[1].thumbUrl, null);
});

test('parseList fallback without grid container skips Featured box; empty/garbage safe', () => {
	const html = `<body><div class="featured">${thumb(9, MD5, 'f // 1x1 // 1KB // jpg')}</div>${thumb(2, MD5B, 't // 1x1 // 1KB // png')}</body>`;
	deq(P.parseList(html).posts.map(p => p.id), ['2']);
	deq(P.parseList('').posts, []);
	deq(P.parseList('<<<not html').posts, []);
});

test('parseDetail: fields; hostile or foreign URLs rejected', () => {
	const d = P.parseDetail(detailHtml());
	assert.strictEqual(d.rating, 'e'); assert.strictEqual(d.score, 7); assert.strictEqual(d.md5, MD5);
	assert.strictEqual(d.width, 800); assert.strictEqual(d.tags, 'cat_girl dog'); assert.strictEqual(d.dateMs, Date.UTC(2024, 4, 6, 7, 8, 9));
	assert.strictEqual(P.parseDetail(detailHtml({ rating: 'Safe' })).rating, 's');
	for (const src of ['javascript:alert(1)', 'http://rule34hentai.net/_images/x/a.jpg', 'https://evil.example/_images/x/a.jpg', 'https://rule34hentai.net.evil.example/_images/x/a.jpg'])
		assert.strictEqual(P.parseDetail(detailHtml({ src })), null, src);
	assert.strictEqual(P.parseDetail('<html></html>'), null);
});

test('parseDetail reads video sources', () => {
	const html = `<video id="main_image"><source src="https://rule34hentai.net/_images/${MD5}/v.mp4"></video>`;
	assert.match(P.parseDetail(html).fileUrl, /v\.mp4$/);
});

test('search parse: popular terms, dates, invalid input', () => {
	const r = S.parse('popular_by_month rating=e cat popular_date:2023-02');
	assert.strictEqual(r.popular, 'month'); deq(r.popularDate, { year: 2023, month: 2, day: 1 });
	deq(r.terms, ['rating=e', 'cat']);
	assert.ok(S.parse('popular_date:2023-13 popular_by_day').notes.some(n => /invalid/.test(n)));
	assert.ok(S.parse('popular_by_day popular_by_year').notes.some(n => /Only one/.test(n)));
});

test('list query: normalises rating=/order=, adds rating from checkboxes, URL-encodes', () => {
	assert.strictEqual(S.buildListQuery(['cat', 'rating=e', 'order=score_desc'], ['s']), 'cat rating:e order:score_desc');
	assert.strictEqual(S.buildListQuery(['cat', 'sort:score'], ['e']), 'cat order:score_desc rating:e');
	assert.strictEqual(S.buildListQuery(['cat'], ['s', 'q', 'e']), 'cat');
	assert.strictEqual(S.buildListUrl('cat rating:e', 3), 'https://rule34hentai.net/post/list/cat%20rating%3Ae/3');
	assert.strictEqual(S.buildListUrl('', 1), 'https://rule34hentai.net/post/list/1');
	assert.strictEqual(S.buildListUrl('a/b?c#d', 1), 'https://rule34hentai.net/post/list/a%2Fb%3Fc%23d/1');
});

test('popular period math: month/year/day boundaries and 2014 stop', () => {
	const today = new Date(2026, 0, 15);
	deq(S.popularPeriod('month', 1, today), { year: 2026, month: 1, day: 1, beforeStart: false });
	assert.strictEqual(S.popularPeriod('month', 2, today).year, 2025); assert.strictEqual(S.popularPeriod('month', 2, today).month, 12);
	assert.strictEqual(S.popularPeriod('year', 3, today).year, 2024);
	const d = S.popularPeriod('day', 16, today); deq([d.year, d.month, d.day], [2025, 12, 31]);
	assert.strictEqual(S.popularPeriod('year', 14, today).beforeStart, true);
	assert.strictEqual(S.popularPeriod('year', 13, today).beforeStart, false);
	assert.strictEqual(S.popularPeriod('month', 1, today, { year: 2019, month: 3, day: 1 }).year, 2019);
	assert.strictEqual(S.buildPopularUrl('month', { year: 2025, month: 12, day: 1 }), 'https://rule34hentai.net/popular_by_month?year=2025&month=12');
	assert.strictEqual(S.buildPopularUrl('year', { year: 2025, month: 1, day: 1 }), 'https://rule34hentai.net/popular_by_year?year=2025');
	assert.strictEqual(S.buildPopularUrl('day', { year: 2025, month: 2, day: 3 }), 'https://rule34hentai.net/popular_by_day?year=2025&month=2&day=3');
});

test('popular filter: tags, negation, wildcards, ext, size, rating/score, unsupported', () => {
	const f = S.buildPopularFilter(['cat*', '-dog', 'ext=webm', 'width>=100', 'score>5', 'rating:e', 'user=bob', 'order:score_desc']);
	deq(f.unsupported, ['user=bob']);
	const ok = { tags: 'catgirl x', ext: 'webm', width: 200, height: 1 };
	assert.ok(f.matchesListEntry(ok));
	assert.ok(!f.matchesListEntry({ ...ok, tags: 'catgirl dog' }));
	assert.ok(!f.matchesListEntry({ ...ok, ext: 'jpg' }));
	assert.ok(!f.matchesListEntry({ ...ok, width: 50 }));
	assert.ok(f.matchesDetail({ rating: 'e', score: 6 }));
	assert.ok(!f.matchesDetail({ rating: 's', score: 6 }));
	assert.ok(!f.matchesDetail({ rating: 'e', score: 5 }));
});

function fetcherWith(chromeApi, fetchFn) { return new Rule34HentaiFetcher(chromeApi, fetchFn); }
const resp = (status, text, url = 'https://rule34hentai.net/x') => Promise.resolve({ status, url, text: () => Promise.resolve(text) });
const CF = '<title>Just a moment...</title>';

test('fetcher: direct success; challenge -> relay; relay preferred afterwards', async () => {
	let direct = 0;
	const sent = [];
	const chromeApi = { runtime: {}, tabs: {
		query: (q, cb) => cb([{ id: 5 }]),
		sendMessage: (id, msg, cb) => { sent.push([id, msg]); cb({ status: 200, url: msg.url, text: 'OK' }); } } };
	const f = fetcherWith(chromeApi, () => { direct++; return resp(403, CF); });
	assert.strictEqual((await f.fetchPage('https://rule34hentai.net/post/list/1')).text, 'OK');
	assert.strictEqual(f.preferRelay, true);
	await f.fetchPage('https://rule34hentai.net/post/list/2');
	assert.strictEqual(direct, 1); assert.strictEqual(sent.length, 2);
	const g = fetcherWith({ runtime: {}, tabs: {} }, () => resp(200, 'direct'));
	assert.strictEqual((await g.fetchPage('u')).text, 'direct');
});

test('fetcher: no tab / lastError / challenge from tab -> helpful error', async () => {
	const none = fetcherWith({ runtime: {}, tabs: { query: (q, cb) => cb([]) } }, () => resp(403, CF));
	await assert.rejects(none.fetchPage('u'), /Open https:\/\/rule34hentai\.net/);
	const err = { runtime: { lastError: null }, tabs: { query: (q, cb) => cb([{ id: 1 }, { id: 2 }]),
		sendMessage: (id, m, cb) => { if (id == 1) { err.runtime.lastError = { message: 'gone' }; cb(undefined); err.runtime.lastError = null; } else cb({ status: 200, url: '', text: 'two' }); } } };
	assert.strictEqual((await fetcherWith(err, () => Promise.reject(new Error('net'))).fetchPage('u')).text, 'two');
	const chal = fetcherWith({ runtime: {}, tabs: { query: (q, cb) => cb([{ id: 1 }]), sendMessage: (i, m, cb) => cb({ status: 200, text: CF }) } }, () => resp(403, CF));
	await assert.rejects(chal.fetchPage('u'), /Cloudflare/);
});

test('relay content script validates sender and URL', async () => {
	const src = fs.readFileSync(path.join(ROOT, 'js/content/rule34hentai_relay.js'), 'utf8');
	let listener;
	const fetched = [];
	const chromeApi = { runtime: { id: 'me', onMessage: { addListener: (l) => { listener = l; } } } };
	const fn = new Function('chrome', 'fetch', 'module', src);
	const mod = { exports: {} };
	fn(chromeApi, (u, o) => { fetched.push([u, o]); return Promise.resolve({ status: 200, url: u, text: () => Promise.resolve('hi') }); }, mod);
	const call = (sender, msg) => new Promise((res) => { const r = listener(msg, sender, res); if (r === false) setTimeout(() => res('no-response'), 5); });
	assert.strictEqual(await call({ id: 'other' }, { type: 'bs-r34h-fetch', url: 'https://rule34hentai.net/post/list/1' }), 'no-response');
	deq(await call({ id: 'me' }, { type: 'bs-r34h-fetch', url: 'https://evil.example/post/list/1' }), { error: 'URL not allowed' });
	deq(await call({ id: 'me' }, { type: 'bs-r34h-fetch', url: 'https://rule34hentai.net/user_admin/x' }), { error: 'URL not allowed' });
	deq(await call({ id: 'me' }, { type: 'bs-r34h-fetch', url: 'https://rule34hentai.net/post/list/cat/1' }), { status: 200, url: 'https://rule34hentai.net/post/list/cat/1', text: 'hi' });
	assert.strictEqual(fetched.length, 1); assert.strictEqual(fetched[0][1].method, 'GET');
	assert.ok(mod.exports.isAllowed('https://rule34hentai.net/popular_by_month?year=2025&month=1'));
});

function fakeFetcher(pages) {
	const calls = [];
	return { calls, preferRelay: false, async fetchPage(url) { calls.push(url); const p = pages[url]; if (p instanceof Error) throw p; return p || { status: 404, url, text: '' }; } };
}
const ok = (text) => ({ status: 200, url: '', text });

function manager(model = {}, pages = {}) {
	const sm = fakeSitesManager(model);
	const m = new SiteManagerRule34Hentai(sm, 100);
	const ff = fakeFetcher(pages);
	m.fetcher = ff; m.webRequester = new Rule34HentaiRequester(ff);
	m.isOnline = true;
	return { m, sm, ff };
}
const run = (m, text, page) => new Promise((resolve) => { m.lastPageLoaded = page - 1; m.performSearch(text, () => resolve()); });

test('end to end: list page -> detail pages -> slides, rating filter in URL, blacklist, dedupe of failures', async () => {
	const { m, ff } = manager({ includeSafe: false, includeQuestionable: false, includeExplicit: true, blacklist: 'bad' }, {
		'https://rule34hentai.net/post/list/cat%20rating%3Ae/1': ok(listHtml(thumb(1, MD5, 'cat // 800x600 // 1MB // jpg') + thumb(2, MD5B, 'cat bad // 1x1 // 1KB // jpg') + thumb(3, MD5B, 'cat // 1x1 // 1KB // jpg'))),
		'https://rule34hentai.net/post/view/1': ok(detailHtml()),
		'https://rule34hentai.net/post/view/2': ok(detailHtml({ src: `https://rule34hentai.net/_images/${MD5B}/2.jpg` })),
		// post 3 detail missing -> skipped, not fatal
	});
	await run(m, 'cat', 1);
	assert.strictEqual(m.allUnsortedSlides.length, 1);
	const s = m.allUnsortedSlides[0];
	assert.strictEqual(s.id, '1'); assert.strictEqual(s.viewableWebsitePostUrl, 'https://rule34hentai.net/post/view/1');
	assert.strictEqual(s.score, 7);
	assert.ok(ff.calls[0].endsWith('/cat%20rating%3Ae/1'));
	assert.strictEqual(m.hasExhaustedSearch, false);
});

test('empty list page exhausts the search; unreadable response is an error', async () => {
	const { m } = manager({}, { 'https://rule34hentai.net/post/list/zzz/1': ok(listHtml('')) });
	await run(m, 'zzz', 1);
	assert.strictEqual(m.hasExhaustedSearch, true);
	const { m: m2, sm } = manager();
	m2.addSlides('garbage');
	assert.strictEqual(m2.ranIntoErrorWhileSearching, true); assert.ok(sm.warnings.length);
});

test('popular + rating + tags combination: scrapes period page, filters, warns about unsupported', async () => {
	const now = new Date();
	const url = S.buildPopularUrl('month', S.popularPeriod('month', 1, now));
	const { m, sm } = manager({}, {
		[url]: ok(listHtml(thumb(1, MD5, 'cat // 800x600 // 1MB // jpg') + thumb(2, MD5B, 'dog // 1x1 // 1KB // jpg'))),
		'https://rule34hentai.net/post/view/1': ok(detailHtml()),
		'https://rule34hentai.net/post/view/2': ok(detailHtml({ src: `https://rule34hentai.net/_images/${MD5B}/2.jpg` })),
	});
	await run(m, 'popular_by_month rating=e cat user=bob', 1);
	deq(m.allUnsortedSlides.map(s => s.id), ['1']);
	assert.ok(sm.warnings.some(w => /user=bob/.test(w)));
	// rating mismatch removes it
	const { m: m2 } = manager({}, { [url]: ok(listHtml(thumb(1, MD5, 'cat // 1x1 // 1KB // jpg'))), 'https://rule34hentai.net/post/view/1': ok(detailHtml({ rating: 'Safe' })) });
	await run(m2, 'popular_by_month rating:e', 1);
	assert.strictEqual(m2.allUnsortedSlides.length, 0);
});

test('popular: five consecutive empty pages exhaust the search; before 2014 stops without requests', async () => {
	const { m, ff } = manager({}, {});
	for (let i = 1; i <= 5; i++)
		await run(m, 'popular_by_day', i);
	assert.strictEqual(m.hasExhaustedSearch, true);
	const { m: m2, ff: ff2 } = manager();
	await run(m2, 'popular_by_year popular_date:2014', 2);
	assert.strictEqual(m2.hasExhaustedSearch, true); assert.strictEqual(ff2.calls.length, 0);
});

test('ping uses list page only (no detail fetches); challenge error surfaces help text', async () => {
	const { m, ff } = manager({}, { 'https://rule34hentai.net/post/list/1': ok(listHtml(thumb(1, MD5, 't // 1x1 // 1KB // jpg'))) });
	m.isOnline = false;
	await new Promise((r) => m.pingStatus(r));
	assert.strictEqual(m.isOnline, true); deq(ff.calls, ['https://rule34hentai.net/post/list/1']);
	const { m: m2, sm } = manager({}, { 'https://rule34hentai.net/post/list/1': new Error(Rule34HentaiFetcher.HELP) });
	m2.isOnline = false;
	await new Promise((r) => m2.pingStatus(r, true));
	assert.strictEqual(m2.isOnline, false); assert.ok(sm.warnings.some(w => /Open https:\/\/rule34hentai\.net/.test(w)));
});

test('stale responses after resetConnection are dropped', async () => {
	let release;
	const slow = { async fetchPage() { await new Promise(r => { release = r; }); return ok(listHtml('')); } };
	const req = new Rule34HentaiRequester(slow);
	let called = false;
	req.makeWebsiteRequest('u', () => { called = true; }, () => { called = true; }, () => { called = true; }, () => { called = true; });
	req.resetConnection();
	release(); await new Promise(r => setTimeout(r, 10));
	assert.strictEqual(called, false);
});

test('factory, credentials, wiring in HTML/manifest', () => {
	assert.ok(SiteManagerFactory.createSiteManager(fakeSitesManager(), SITE_RULE34HENTAI, 100) instanceof SiteManagerRule34Hentai);
	assert.strictEqual(manager().m.requiresCredentials(), false);
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
	assert.ok(manifest.host_permissions.includes('https://rule34hentai.net/*'));
	deq(manifest.content_scripts[0].matches, ['https://rule34hentai.net/*']);
	assert.match(manifest.content_security_policy.extension_pages, /connect-src[^;]*https:\/\/rule34hentai\.net/);
	for (const f of ['slideshow.html', 'personal_list.html'])
	{
		const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
		for (const s of ['r34h_search', 'r34h_parser', 'r34h_fetcher', 'r34h_requester', 'site_manager_rule34hentai'])
			assert.ok(html.includes(s + '.js'), f + ' ' + s);
	}
	assert.match(fs.readFileSync(path.join(ROOT, 'slideshow.html'), 'utf8'), /value="R34H"/);
});
