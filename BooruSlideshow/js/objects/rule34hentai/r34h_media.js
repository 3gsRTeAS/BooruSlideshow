// Pictures and videos from rule34hentai.net.
//
// Cloudflare answers the extension page's own image/video requests with a challenge (HTTP 403), because
// the clearance cookie of your open site tab is not sent along (seen in a saved network log). So the
// files are downloaded by that open tab (same as for pages) and shown from blob: URLs.
// If no tab can do it, the normal URL is used as a fallback.
class Rule34HentaiMedia
{
	static get MAX_FILE_BYTES() { return 100 * 1024 * 1024; }
	static get MAX_CACHE_BYTES() { return 300 * 1024 * 1024; }
	static get MAX_CONCURRENT() { return 4; }

	static isManaged(url)
	{
		try
		{
			const u = new URL(url);

			return u.protocol === 'https:' && u.hostname === 'rule34hentai.net' && /^\/_(images|thumbs)\//.test(u.pathname);
		}
		catch (e)
		{
			return false;
		}
	}

	static init(chromeApi, fetchFn)
	{
		Rule34HentaiMedia.fetcher = new Rule34HentaiFetcher(chromeApi, fetchFn);
		Rule34HentaiMedia.cache = new Map();   // url -> { promise, bytes, blobUrl }
		Rule34HentaiMedia.active = 0;
		Rule34HentaiMedia.waiting = [];
		Rule34HentaiMedia.totalBytes = 0;
	}

	static ensureInit()
	{
		if (!Rule34HentaiMedia.cache)
			Rule34HentaiMedia.init(chrome, (...a) => fetch(...a));
	}

	static acquire()
	{
		if (Rule34HentaiMedia.active < Rule34HentaiMedia.MAX_CONCURRENT)
		{
			Rule34HentaiMedia.active++;
			return Promise.resolve();
		}

		return new Promise((resolve) => Rule34HentaiMedia.waiting.push(resolve));
	}

	static release()
	{
		const next = Rule34HentaiMedia.waiting.shift();

		if (next) next();
		else Rule34HentaiMedia.active--;
	}

	static async download(url)
	{
		await Rule34HentaiMedia.acquire();

		try
		{
			const relayed = await Rule34HentaiMedia.fetcher.relay(url, 'bs-r34h-media');
			const a = relayed.answer;

			if (a == null || a.status !== 200 || !(a.data instanceof ArrayBuffer))
				return null;

			if (!/^(image|video)\/[a-z0-9.+-]+$/i.test(a.type || '') || a.data.byteLength > Rule34HentaiMedia.MAX_FILE_BYTES)
				return null;

			return { blobUrl: URL.createObjectURL(new Blob([a.data], { type: a.type })), bytes: a.data.byteLength };
		}
		catch (e)
		{
			return null;
		}
		finally
		{
			Rule34HentaiMedia.release();
		}
	}

	// Least recently used files go first; the newest few are always kept.
	static evict()
	{
		const keys = Array.from(Rule34HentaiMedia.cache.keys());

		for (let i = 0; i < keys.length - 8 && Rule34HentaiMedia.totalBytes > Rule34HentaiMedia.MAX_CACHE_BYTES; i++)
		{
			const entry = Rule34HentaiMedia.cache.get(keys[i]);

			if (entry.blobUrl == null)
				continue;

			URL.revokeObjectURL(entry.blobUrl);
			Rule34HentaiMedia.totalBytes -= entry.bytes;
			Rule34HentaiMedia.cache.delete(keys[i]);
		}
	}

	// Resolves with a blob: URL, or null when it could not be fetched through a tab.
	static getBlobUrl(url)
	{
		Rule34HentaiMedia.ensureInit();

		const existing = Rule34HentaiMedia.cache.get(url);

		if (existing)
		{
			Rule34HentaiMedia.cache.delete(url); // re-insert = most recently used
			Rule34HentaiMedia.cache.set(url, existing);
			return existing.promise;
		}

		const entry = { promise: null, bytes: 0, blobUrl: null };

		entry.promise = Rule34HentaiMedia.download(url).then((r) => {
			if (r == null)
			{
				if (Rule34HentaiMedia.cache.get(url) === entry)
					Rule34HentaiMedia.cache.delete(url); // allow a retry later

				return null;
			}

			entry.blobUrl = r.blobUrl;
			entry.bytes = r.bytes;
			Rule34HentaiMedia.totalBytes += r.bytes;
			Rule34HentaiMedia.evict();

			return r.blobUrl;
		});

		Rule34HentaiMedia.cache.set(url, entry);

		return entry.promise;
	}
}

if (typeof module !== 'undefined' && module.exports)
{
	module.exports = { Rule34HentaiMedia };
}
