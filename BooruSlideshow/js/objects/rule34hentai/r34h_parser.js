// rule34hentai.net HTML parsing (pure functions).
//
// The site runs Shimmie 2.9.1+ and has no API that was found, so pages are read. Everything read
// from a page is untrusted: URLs must be https and on rule34hentai.net itself (the pages carry
// third-party ads), text is only ever kept as text, and a page that does not look as expected
// produces "nothing found" rather than guesses.
//
// Layout knowledge: list pages show a link to /post/view/<id> around each thumbnail
// (/_thumbs/<md5>/thumb.jpg) whose title reads "<tags> // <W>x<H>[, <seconds>s] // <size> // <ext>".
// Post pages are read with several fallbacks because their markup was not available to inspect.
class Rule34HentaiParser
{
	static parseHtml(html)
	{
		return new DOMParser().parseFromString(String(html || ''), 'text/html');
	}

	static isOwnHost(hostname)
	{
		return hostname === 'rule34hentai.net' || hostname.endsWith('.rule34hentai.net');
	}

	// A usable https URL on the site itself, or null.
	static ownUrl(value, base)
	{
		const safe = sanitizeHttpsUrl(value, base || 'https://rule34hentai.net/');

		if (safe == null)
			return null;

		return Rule34HentaiParser.isOwnHost(new URL(safe).hostname) ? safe : null;
	}

	// "tag_a tag_b // 1920x1080, 47.9s // 39.6MB // mp4" -> parts, or null if it doesn't match.
	static parseTitle(title)
	{
		const m = /^(.*?)\s*\/\/\s*(\d+)x(\d+)(?:,\s*([\d.]+)s)?\s*\/\/\s*([\d.]+\s*[KMGT]?B)\s*\/\/\s*([A-Za-z0-9]+)\s*$/.exec(String(title || '').trim());

		if (m == null)
			return null;

		return {
			tags: m[1].trim().substring(0, 4000),
			width: Number(m[2]),
			height: Number(m[3]),
			durationSeconds: m[4] ? Number(m[4]) : null,
			sizeText: m[5],
			ext: m[6].toLowerCase()
		};
	}

	// The file's address follows a pattern seen on every file of the site: /_images/<md5>/<id> - <title tags>.<ext>
	// (matches 8 of 8 file requests in a saved network log). It lets posts be shown without opening each post page.
	static buildFileUrl(entry)
	{
		if (!entry.md5 || !entry.ext || entry.titleName == null || !/^[a-z0-9]{1,6}$/.test(entry.ext))
			return null;

		const name = entry.id + ' - ' + entry.titleName + '.' + entry.ext;
		const encoded = encodeURIComponent(name).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

		return 'https://rule34hentai.net/_images/' + entry.md5 + '/' + encoded;
	}

	static isInsideFeaturedBox(element)
	{
		for (let node = element; node != null && node.nodeType == 1; node = node.parentElement)
		{
			if (/featured/i.test(node.id || '') || /featured/i.test(node.getAttribute('class') || ''))
				return true;
		}

		return false;
	}

	static extFromMime(mime)
	{
		const m = /^(?:image|video)\/([a-z0-9.+-]+)$/i.exec(String(mime || ''));

		if (m == null)
			return '';

		const sub = m[1].toLowerCase();

		return { jpeg: 'jpg', 'svg+xml': 'svg', quicktime: 'mov', 'x-matroska': 'mkv' }[sub] || sub;
	}

	// Returns { posts: [{id, md5, thumbUrl, tags, width, height, ext}], sawLinks }.
	// Live markup (checked against saved pages): <a class="thumb shm-thumb" href=".../post/view/ID[#search=..]"
	// data-tags data-width data-height data-mime data-post-id><img title="... // WxH // size // ext"></a>.
	static parseList(html)
	{
		const doc = Rule34HentaiParser.parseHtml(html);
		const grid = doc.querySelector('#image-list .shm-image-list, .shm-image-list, #image-list');
		const scope = grid || doc;
		const seen = new Set();
		const posts = [];

		for (const a of scope.querySelectorAll('a[href]'))
		{
			const m = /(?:^|\/)post\/view\/(\d{1,12})\/?(?:[?#].*)?$/.exec(a.getAttribute('href') || '');

			if (m == null)
				continue;

			const img = a.querySelector('img');

			if (img == null || seen.has(m[1]))
				continue;

			if (!grid && Rule34HentaiParser.isInsideFeaturedBox(a))
				continue;

			seen.add(m[1]);

			const thumbUrl = Rule34HentaiParser.ownUrl(img.getAttribute('src') || img.getAttribute('data-src') || '');
			const md5Match = /\/_thumbs\/([0-9a-f]{32})\//i.exec(thumbUrl || '');
			const meta = Rule34HentaiParser.parseTitle(a.getAttribute('title') || img.getAttribute('title') || img.getAttribute('alt') || '');
			const dataTags = a.getAttribute('data-tags');
			const dw = Number(a.getAttribute('data-width'));
			const dh = Number(a.getAttribute('data-height'));

			posts.push({
				id: m[1],
				md5: md5Match ? md5Match[1].toLowerCase() : null,
				thumbUrl: thumbUrl,
				tags: (dataTags != null ? dataTags : (meta ? meta.tags : '')).toLowerCase().substring(0, 4000),
				width: dw > 0 ? dw : (meta ? meta.width : NaN),
				height: dh > 0 ? dh : (meta ? meta.height : NaN),
				titleName: meta ? meta.tags : null,
				ext: (meta ? meta.ext : '') || Rule34HentaiParser.extFromMime(a.getAttribute('data-mime'))
			});
		}

		return { posts: posts, sawLinks: seen.size > 0 };
	}

	static ratingLetter(text)
	{
		const t = String(text || '').trim().toLowerCase();

		if (t.startsWith('explicit') || t == 'e') return 'e';
		if (t.startsWith('questionable') || t == 'q') return 'q';
		if (t.startsWith('safe') || t == 's') return 's';

		return 'u';
	}

	// Reads one post page. Returns null when no usable media URL could be found.
	static parseDetail(html)
	{
		const doc = Rule34HentaiParser.parseHtml(html);
		const candidates = [
			'#main_image', 'video#main_image source[src]', '.shm-main-image', 'video source[src]',
			'img[src*="/_images/"]', 'a[href*="/_images/"]'
		];
		let fileUrl = null;

		for (const selector of candidates)
		{
			for (const el of doc.querySelectorAll(selector))
			{
				const raw = el.getAttribute('src') || el.getAttribute('href') || (el.querySelector && el.querySelector('source') ? el.querySelector('source').getAttribute('src') : '');
				const url = Rule34HentaiParser.ownUrl(raw);

				if (url != null && /\/_images\//.test(new URL(url).pathname))
				{
					fileUrl = url;
					break;
				}
			}

			if (fileUrl != null)
				break;
		}

		if (fileUrl == null)
			return null;

		const text = (doc.body ? doc.body.textContent : '') || '';
		const main = doc.querySelector('#main_image, .shm-main-image');
		const ratingEl = doc.querySelector('[data-rating]');
		let rating;

		if (ratingEl != null)
			rating = Rule34HentaiParser.ratingLetter(ratingEl.getAttribute('data-rating'));
		else
		{
			// Live markup: <tr><th>Rating</th><td><span class="view">Unrated</span> <span class="edit"><select>...
			rating = 'u';

			for (const th of doc.querySelectorAll('th'))
			{
				if (th.textContent.trim().toLowerCase() === 'rating')
				{
					const view = th.parentElement.querySelector('.view');
					rating = Rule34HentaiParser.ratingLetter(view ? view.textContent : '');
					break;
				}
			}

			if (rating == 'u')
			{
				const rm = /Rating:\s*(Safe|Questionable|Explicit)/i.exec(text);
				rating = rm ? Rule34HentaiParser.ratingLetter(rm[1]) : 'u';
			}
		}

		const scoreMatch = /(?:Current\s+)?Score:\s*(-?\d+)/i.exec(text);
		const md5Match = /\/_images\/([0-9a-f]{32})\//i.exec(fileUrl);
		const sizeMatch = /\((\d{1,5})x(\d{1,5})\)/.exec(text);
		const timeEl = doc.querySelector('time[datetime]');
		const date = timeEl ? new Date(timeEl.getAttribute('datetime')) : null;
		const tagEls = doc.querySelectorAll('.tag_name');
		let tags = Array.from(tagEls).map(el => el.textContent.trim().replace(/\s+/g, '_').toLowerCase()).filter(Boolean).join(' ');

		if (tags == '' && main != null)
			tags = main.getAttribute('data-tags') || '';

		return {
			fileUrl: fileUrl,
			md5: md5Match ? md5Match[1].toLowerCase() : null,
			rating: rating,
			score: scoreMatch ? Number(scoreMatch[1]) : 0,
			width: main && main.getAttribute('data-width') ? Number(main.getAttribute('data-width')) : (sizeMatch ? Number(sizeMatch[1]) : NaN),
			height: main && main.getAttribute('data-height') ? Number(main.getAttribute('data-height')) : (sizeMatch ? Number(sizeMatch[2]) : NaN),
			tags: tags.substring(0, 4000),
			dateMs: date && !isNaN(date.getTime()) ? date.getTime() : 0
		};
	}
}

if (typeof module !== 'undefined' && module.exports)
{
	module.exports = { Rule34HentaiParser };
}
