// Content script for https://rule34hentai.net/* pages the user has open.
//
// rule34hentai.net sits behind a Cloudflare check that only a real browser tab can pass. When the
// user has the site open (check passed), the extension asks that tab to read a page for it, so the
// request carries the tab's own cookies. Nothing here solves or bypasses the check; if the tab has
// not passed it, the answer is simply a challenge page and the extension tells the user.
(function () {
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

	const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

	api.runtime.onMessage.addListener(function (message, sender, sendResponse) {
		if (sender.id !== api.runtime.id || message == null || message.type !== 'bs-r34h-fetch')
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
		module.exports = { isAllowed: isAllowed };
})();
