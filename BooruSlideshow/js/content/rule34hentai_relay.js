// Content script for https://rule34hentai.net/* pages the user has open.
//
// rule34hentai.net sits behind a Cloudflare check that only a real browser tab can pass. When the
// user has the site open (check passed), the extension asks that tab to read a page for it, so the
// request carries the tab's own cookies. Nothing here solves or bypasses the check; if the tab has
// not passed it, the answer is simply a challenge page and the extension tells the user.
(function () {
	// Version 2 added media downloads. A copy left in a tab by an older build lacks it, so only a
	// copy of this same version counts as "already injected".
	if (typeof window !== 'undefined' && window.__bsR34hRelay === 2)
		return;

	if (typeof window !== 'undefined')
		window.__bsR34hRelay = 2;

	const MAX_BYTES = 4 * 1024 * 1024;
	const ALLOWED_PATH = /^\/(post\/list(\/|$)|post\/view\/\d{1,12}\/?$|popular_by_(day|month|year)\/?$)/;

	function isAllowed(rawUrl)
	{
		let u;

		try { u = new URL(rawUrl); } catch (e) { return false; }

		return u.origin === 'https://rule34hentai.net' && ALLOWED_PATH.test(u.pathname);
	}

	async function relayFetch(url)
	{
		const response = await fetch(url, { method: 'GET', credentials: 'same-origin', redirect: 'follow' });
		const text = (await response.text()).substring(0, MAX_BYTES);

		return { status: response.status, url: response.url, text: text };
	}

	const MEDIA_PATH = /^\/_(images|thumbs)\/[0-9a-f]{32}\/[^/]+$/;
	const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

	function isAllowedMedia(rawUrl)
	{
		let u;

		try { u = new URL(rawUrl); } catch (e) { return false; }

		return u.origin === 'https://rule34hentai.net' && MEDIA_PATH.test(u.pathname);
	}

	async function relayMedia(url)
	{
		const response = await fetch(url, { method: 'GET', credentials: 'same-origin', redirect: 'follow' });
		const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
		const length = Number(response.headers.get('content-length') || 0);

		// A challenge page is HTML; only real pictures/videos are passed on.
		if (!response.ok || !/^(image|video)\//.test(type) || length > MAX_MEDIA_BYTES)
			return { status: response.ok ? 415 : response.status, type: type };

		const data = await response.arrayBuffer();

		return data.byteLength > MAX_MEDIA_BYTES ? { status: 413, type: type } : { status: 200, type: type, data: data };
	}

	const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

	api.runtime.onMessage.addListener(function (message, sender, sendResponse) {
		if (sender.id !== api.runtime.id || message == null)
			return false;

		if (message.type === 'bs-r34h-media')
		{
			if (typeof message.url !== 'string' || !isAllowedMedia(message.url))
			{
				sendResponse({ error: 'URL not allowed' });
				return false;
			}

			relayMedia(message.url).then(sendResponse, function () { sendResponse({ error: 'fetch failed' }); });

			return true;
		}

		if (message.type !== 'bs-r34h-fetch')
			return false;

		if (typeof message.url !== 'string' || !isAllowed(message.url))
		{
			sendResponse({ error: 'URL not allowed' });
			return false;
		}

		relayFetch(message.url).then(sendResponse, function () { sendResponse({ error: 'fetch failed' }); });

		return true; // async response
	});

	if (typeof module !== 'undefined' && module.exports)
		module.exports = { isAllowed: isAllowed, isAllowedMedia: isAllowedMedia };
})();
