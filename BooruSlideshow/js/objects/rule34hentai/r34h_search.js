// rule34hentai.net search planning (pure functions, no network).
//
// Syntax follows the site's own help page (https://rule34hentai.net/help/search): rating:e,
// order:score_desc, ext:webm, score>5, -tag, wildcards. Normal searches are sent to the server.
//
// The popular pages (popular_by_day / _month / _year) take no tags, so they are scraped per period
// and the rest of the search is applied on this side. Page N of such a search is the N-th period
// going back in time (this month, last month, ...).
//
// Extra search terms understood by this extension only:
//   popular_by_day | popular_by_month | popular_by_year
//   popular_date:YYYY[-MM[-DD]]   start from that period instead of the current one
class Rule34HentaiSearch
{
	static get ORIGIN() { return 'https://rule34hentai.net'; }

	// The site was founded in 2014; there is nothing to find before that.
	static get FIRST_YEAR() { return 2014; }

	static parse(searchText)
	{
		const tokens = String(searchText || '').trim().split(/\s+/).filter(Boolean);
		const notes = [];
		const terms = [];
		let popular = null;
		let popularDate = null;

		for (const raw of tokens)
		{
			const t = raw.toLowerCase();
			let m = /^popular_by_(day|month|year)$/.exec(t);

			if (m)
			{
				if (popular == null)
					popular = m[1];
				else if (popular != m[1])
					notes.push('Only one popular_by term can be used at a time; using popular_by_' + popular + '.');

				continue;
			}

			m = /^popular_date[:=](\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(t);

			if (m)
			{
				const year = Number(m[1]);
				const month = m[2] ? Number(m[2]) : 1;
				const day = m[3] ? Number(m[3]) : 1;
				const probe = new Date(Date.UTC(year, month - 1, day));

				if (month >= 1 && month <= 12 && probe.getUTCFullYear() == year && probe.getUTCMonth() == month - 1 && probe.getUTCDate() == day)
					popularDate = { year: year, month: month, day: day };
				else
					notes.push('Ignored the invalid date "' + raw + '".');

				continue;
			}

			if (/^popular_date[:=]/.test(t))
			{
				notes.push('Ignored the invalid date "' + raw + '". Use popular_date:YYYY, popular_date:YYYY-MM or popular_date:YYYY-MM-DD.');
				continue;
			}

			terms.push(raw);
		}

		if (popularDate != null && popular == null)
			notes.push('popular_date only applies together with popular_by_day, popular_by_month or popular_by_year.');

		return { popular: popular, popularDate: popularDate, terms: terms, notes: notes };
	}

	// ---- normal (server-side) searches ----

	static mapOrder(value)
	{
		switch (value)
		{
			case 'id': return 'id_asc';
			case 'score': return 'score_desc';
			default: return value;
		}
	}

	// allowedRatings: e.g. ['e'] or ['s','q'], or null when no rating filtering is wanted.
	static buildListQuery(terms, allowedRatings)
	{
		const out = [];
		let hasRatingTerm = false;

		for (const raw of terms)
		{
			let m = /^rating[:=]([a-z?*]+)$/i.exec(raw);

			if (m)
			{
				out.push('rating=' + m[1].toLowerCase());
				hasRatingTerm = true;
				continue;
			}

			m = /^(?:order|sort)[:=](.+)$/i.exec(raw);

			if (m)
			{
				out.push('order=' + Rule34HentaiSearch.mapOrder(m[1].toLowerCase()));
				continue;
			}

			out.push(raw);
		}

		if (!hasRatingTerm && allowedRatings && allowedRatings.length > 0 && allowedRatings.length < 3)
			out.push('rating=' + allowedRatings.join(''));

		return out.join(' ');
	}

	static buildListUrl(query, page)
	{
		const base = Rule34HentaiSearch.ORIGIN + '/post/list/';

		// The site separates tags in the address with "+" (its own links look like animated+rating%3De).
		const terms = query.split(/\s+/).filter(Boolean).map(encodeURIComponent).join('+');

		return terms == '' ? base + page : base + terms + '/' + page;
	}

	// ---- popular pages ----

	// today: a Date. Returns the period shown on page number `page` (1 = newest).
	static popularPeriod(kind, page, today, popularDate)
	{
		const y = popularDate ? popularDate.year : today.getFullYear();
		const m = popularDate ? popularDate.month : today.getMonth() + 1;
		const d = popularDate ? popularDate.day : today.getDate();
		const back = page - 1;
		let date;

		if (kind == 'day')
			date = new Date(Date.UTC(y, m - 1, d - back));
		else if (kind == 'month')
			date = new Date(Date.UTC(y, m - 1 - back, 1));
		else
			date = new Date(Date.UTC(y - back, 0, 1));

		const year = date.getUTCFullYear();

		return {
			year: year,
			month: date.getUTCMonth() + 1,
			day: date.getUTCDate(),
			beforeStart: year < Rule34HentaiSearch.FIRST_YEAR
		};
	}

	static buildPopularUrl(kind, period)
	{
		const base = Rule34HentaiSearch.ORIGIN + '/popular_by_' + kind + '?year=' + period.year;

		if (kind == 'year')
			return base;

		if (kind == 'month')
			return base + '&month=' + period.month;

		return base + '&month=' + period.month + '&day=' + period.day;
	}

	static wildcardToRegExp(pattern)
	{
		const escaped = pattern.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');

		return new RegExp('^' + escaped + '$');
	}

	// Builds the client-side filter for a popular search. Terms it cannot apply are reported in
	// `unsupported` so the user is told instead of getting silently wrong results.
	static buildPopularFilter(terms)
	{
		const include = [];
		const exclude = [];
		const exts = new Set();
		const compareCheap = [];
		const compareDetail = [];
		const unsupported = [];
		let ratings = null;

		for (const raw of terms)
		{
			const lower = raw.toLowerCase();
			let m;

			if (/^(?:order|sort)[:=]/.test(lower))
				continue; // sorting is done by the app on the loaded posts

			if ((m = /^rating[:=]([sqeu?*]+)$/.exec(lower)))
			{
				ratings = m[1].indexOf('*') >= 0 ? null : new Set(m[1].split('').map(c => c == '?' ? 'u' : c));
				continue;
			}

			if ((m = /^ext[:=]([a-z0-9]+)$/.exec(lower)))
			{
				exts.add(m[1]);
				continue;
			}

			if ((m = /^(score|width|height)(<=|>=|<|>|=)(-?\d+)$/.exec(lower)))
			{
				(m[1] == 'score' ? compareDetail : compareCheap).push({ field: m[1], op: m[2], value: Number(m[3]) });
				continue;
			}

			if (lower.charAt(0) == '-' && lower.length > 1 && !/[:=<>]/.test(lower))
			{
				exclude.push(Rule34HentaiSearch.wildcardToRegExp(lower.substring(1)));
				continue;
			}

			if (/[:=<>]/.test(lower) || lower.charAt(0) == '-')
			{
				unsupported.push(raw);
				continue;
			}

			include.push(Rule34HentaiSearch.wildcardToRegExp(lower));
		}

		const compare = (list, values) => list.every(c => {
			const v = values[c.field];

			if (typeof v != 'number' || isNaN(v))
				return false;

			switch (c.op)
			{
				case '<': return v < c.value;
				case '<=': return v <= c.value;
				case '>': return v > c.value;
				case '>=': return v >= c.value;
				default: return v == c.value;
			}
		});

		return {
			unsupported: unsupported,

			// True when rating or score (only on the post page) must be known to apply the filter.
			needsDetail: ratings != null || compareDetail.length > 0,

			// Uses only what the list page shows: tags, extension, width, height.
			matchesListEntry: function (post) {
				const tags = String(post.tags || '').toLowerCase().split(/\s+/).filter(Boolean);

				if (!include.every(re => tags.some(t => re.test(t))))
					return false;

				if (exclude.some(re => tags.some(t => re.test(t))))
					return false;

				if (exts.size > 0 && !exts.has(String(post.ext || '').toLowerCase()))
					return false;

				return compare(compareCheap, { width: post.width, height: post.height });
			},

			// Uses what only the post page shows: rating and score.
			matchesDetail: function (post) {
				if (ratings != null && !ratings.has(post.rating))
					return false;

				return compare(compareDetail, { score: post.score });
			}
		};
	}
}

if (typeof module !== 'undefined' && module.exports)
{
	module.exports = { Rule34HentaiSearch };
}
