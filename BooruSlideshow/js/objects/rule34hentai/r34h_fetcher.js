// Reads rule34hentai.net pages. Tries a normal request first (works when Cloudflare lets the
// extension through, e.g. thanks to cookies from a check passed in Firefox). If the answer is a
// Cloudflare check page, falls back to asking an open rule34hentai.net tab to make the request.
// Never tries to solve or sidestep the check.
class Rule34HentaiFetcher
{
	constructor(chromeApi, fetchFn)
	{
		this.chrome = chromeApi;
		this.fetchFn = fetchFn;
		this.preferRelay = false;
	}

	static get HELP()
	{
		return 'rule34hentai.net is protected by a Cloudflare check. Open https://rule34hentai.net in a Firefox tab, let the check finish, reload that tab once, keep it open, then search again.';
	}

	static looksLikeChallenge(status, text)
	{
		if (status === 403 || status === 429 || status === 503)
			return true;

		return /<title>\s*Just a moment|challenge-platform|cf-chl-|Performing security verification/i.test(String(text || '').substring(0, 20000));
	}

	async direct(url)
	{
		const response = await this.fetchFn(url, { method: 'GET', credentials: 'include', redirect: 'follow' });
		const text = await response.text();

		return { status: response.status, url: response.url, text: text.substring(0, 4 * 1024 * 1024) };
	}

	ask(tabId, url)
	{
		return new Promise((resolve) => {
			try { this.chrome.tabs.sendMessage(tabId, { type: 'bs-r34h-fetch', url: url }, (r) => resolve(this.chrome.runtime.lastError ? null : r)); }
			catch (e) { resolve(null); }
		});
	}

	// Tabs opened before the extension was allowed on the site don't have the helper script yet.
	// Inject it on demand (needs the "scripting" permission plus the site permission).
	async inject(tabId)
	{
		try
		{
			if (!this.chrome.scripting || !this.chrome.scripting.executeScript)
				return false;

			await this.chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['js/content/rule34hentai_relay.js'] });

			return true;
		}
		catch (e)
		{
			return false;
		}
	}

	// Returns { answer, tabCount }. answer is null if no tab could fetch the page.
	async relay(url)
	{
		const tabs = await new Promise((resolve) => {
			try { this.chrome.tabs.query({ url: 'https://rule34hentai.net/*' }, (t) => resolve(this.chrome.runtime.lastError ? [] : (t || []))); }
			catch (e) { resolve([]); }
		});

		for (const tab of tabs)
		{
			let answer = await this.ask(tab.id, url);

			if (answer == null && await this.inject(tab.id))
				answer = await this.ask(tab.id, url);

			if (answer && typeof answer.text === 'string' && typeof answer.status === 'number')
				return { answer: answer, tabCount: tabs.length };
		}

		return { answer: null, tabCount: tabs.length };
	}

	// Resolves { status, url, text }, or rejects with Error whose message is user-facing.
	async fetchPage(url)
	{
		if (!this.preferRelay)
		{
			try
			{
				const r = await this.direct(url);

				if (!Rule34HentaiFetcher.looksLikeChallenge(r.status, r.text))
					return r;
			}
			catch (e) { /* fall through to the tab */ }
		}

		const relayed = await this.relay(url);
		const viaTab = relayed.answer;

		if (viaTab && !Rule34HentaiFetcher.looksLikeChallenge(viaTab.status, viaTab.text))
		{
			this.preferRelay = true;
			return viaTab;
		}

		this.preferRelay = false;

		if (viaTab && viaTab.status === 404)
			return viaTab;

		if (relayed.tabCount === 0)
			throw new Error('No open rule34hentai.net tab was found. ' + Rule34HentaiFetcher.HELP);

		if (viaTab == null)
			throw new Error('A rule34hentai.net tab is open but could not be read. Reload that tab (F5) and make sure the extension is allowed on the site. ' + Rule34HentaiFetcher.HELP);

		throw new Error(Rule34HentaiFetcher.HELP);
	}
}

if (typeof module !== 'undefined' && module.exports)
{
	module.exports = { Rule34HentaiFetcher };
}
