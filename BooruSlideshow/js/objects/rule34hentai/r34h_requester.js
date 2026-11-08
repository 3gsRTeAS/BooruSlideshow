// Stands in for WebRequester for rule34hentai.net. One "request" = fetch a list/popular page,
// parse it, fetch each post's page (for the file URL, rating and score), and hand the manager
// normalised JSON. The manager sets `plan` before each request.
class Rule34HentaiRequester
{
	constructor(fetcher)
	{
		this.fetcher = fetcher;
		this.plan = { mode: 'ping' };
		this.generation = 0;
		this.concurrency = 4;
		this.withCredentials = false;
	}

	resetConnection()
	{
		this.generation++;
	}

	makeWebsiteRequest(url, onSuccess, onErrorResponse, onAfterAnyResponse, onError)
	{
		const generation = this.generation;
		const plan = this.plan || { mode: 'ping' };
		const stale = () => generation !== this.generation;

		this.run(url, plan, stale).then(
			(result) => {
				if (stale()) return;
				if (result.error) onErrorResponse(JSON.stringify({ message: result.error }), result.status || 0);
				else onSuccess(JSON.stringify(result));
				onAfterAnyResponse();
			},
			(e) => {
				if (stale()) return;
				onErrorResponse(JSON.stringify({ message: String(e && e.message || e).substring(0, 300) }), 0);
				onAfterAnyResponse();
			});
	}

	async run(url, plan, stale)
	{
		const page = await this.fetcher.fetchPage(url);

		// Shimmie answers a search with no results with 404 and a "no posts" page.
		if (page.status === 404 && plan.mode !== 'ping')
			return { posts: [], listed: 0 };

		if (page.status < 200 || page.status >= 300)
			return { error: 'rule34hentai.net answered with status ' + page.status + '.', status: page.status };

		const list = Rule34HentaiParser.parseList(page.text);
		let entries = list.posts;

		if (plan.mode === 'ping')
			return { posts: entries.slice(0, 1), listed: entries.length };

		const filter = plan.filter;
		const listed = entries.length;

		if (filter)
			entries = entries.filter((p) => filter.matchesListEntry(p));

		entries = entries.filter((p) => plan.keepEntry ? plan.keepEntry(p) : true);

		const posts = new Array(entries.length).fill(null);
		let next = 0;

		const worker = async () => {
			while (next < entries.length && !stale())
			{
				const i = next++;
				const e = entries[i];

				try
				{
					const d = await this.fetcher.fetchPage('https://rule34hentai.net/post/view/' + e.id);
					const detail = d.status === 200 ? Rule34HentaiParser.parseDetail(d.text) : null;

					if (detail == null || (filter && !filter.matchesDetail(detail)))
						continue;

					posts[i] = {
						id: e.id,
						md5: detail.md5 || e.md5,
						fileUrl: detail.fileUrl,
						previewUrl: e.thumbUrl,
						tags: e.tags || detail.tags,
						rating: detail.rating,
						score: detail.score,
						width: isNaN(detail.width) ? e.width : detail.width,
						height: isNaN(detail.height) ? e.height : detail.height,
						ext: e.ext,
						dateMs: detail.dateMs
					};
				}
				catch (err)
				{
					if (i === 0 && plan.failFast !== false && err && /Cloudflare/.test(err.message))
						throw err;
				}
			}
		};

		await Promise.all(Array.from({ length: Math.min(this.concurrency, entries.length) }, worker));

		return { posts: posts.filter(Boolean), listed: listed };
	}
}

if (typeof module !== 'undefined' && module.exports)
{
	module.exports = { Rule34HentaiRequester };
}
