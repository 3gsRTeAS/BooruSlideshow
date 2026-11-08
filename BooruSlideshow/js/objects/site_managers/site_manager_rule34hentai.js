// rule34hentai.net. No usable API was found (the site runs Shimmie 2.9.1+ behind a Cloudflare
// check), so pages are read; see js/objects/rule34hentai/. Supports the site's search syntax plus
// popular_by_day / popular_by_month / popular_by_year (see r34h_search.js).
class SiteManagerRule34Hentai extends SiteManager
{
	constructor(sitesManager, pageLimit)
	{
		super(sitesManager, SITE_RULE34HENTAI, 'https://rule34hentai.net', pageLimit);

		this.fetcher = new Rule34HentaiFetcher(chrome, (...a) => fetch(...a));
		this.webRequester = new Rule34HentaiRequester(this.fetcher);
		this.emptyStreak = 0;
		this.currentPage = 1;
	}

	static get MAX_EMPTY_PAGES() { return 5; }

	// Can be re-checked when the user opens/clears the site's tab.
	isRecheckable()
	{
		return true;
	}

	getAllowedRatings()
	{
		const m = this.sitesManager.model;
		const r = [];

		if (m.includeSafe) r.push('s');
		if (m.includeQuestionable) r.push('q');
		if (m.includeExplicit) r.push('e');

		return r.length == 0 ? null : r;
	}

	resetConnection()
	{
		super.resetConnection();
		this.emptyStreak = 0;
	}

	describeOfflineResponse()
	{
		return Rule34HentaiFetcher.HELP;
	}

	buildPingRequestUrl()
	{
		this.webRequester.plan = { mode: 'ping' };

		return this.url + '/post/list/1';
	}

	doesResponseTextIndicateOnline(responseText)
	{
		try { return JSON.parse(responseText).posts.length > 0; } catch (e) { return false; }
	}

	buildRequestUrl(searchText, pageNumber)
	{
		const parsed = Rule34HentaiSearch.parse(searchText);

		if (pageNumber == 1)
		{
			for (const note of parsed.notes)
				this.sitesManager.displayWarningMessage(note);
		}

		this.currentPage = pageNumber;

		if (parsed.popular == null)
		{
			const query = Rule34HentaiSearch.buildListQuery(parsed.terms, this.getAllowedRatings());
			this.webRequester.plan = { mode: 'list', keepEntry: this.keepListEntry.bind(this) };

			return Rule34HentaiSearch.buildListUrl(query, pageNumber);
		}

		const period = Rule34HentaiSearch.popularPeriod(parsed.popular, pageNumber, new Date(), parsed.popularDate);
		const filter = Rule34HentaiSearch.buildPopularFilter(parsed.terms);

		if (pageNumber == 1 && filter.unsupported.length > 0)
			this.sitesManager.displayWarningMessage('Not supported together with popular_by_' + parsed.popular + ' and ignored: ' + filter.unsupported.join(' '));

		this.webRequester.plan = { mode: 'popular', filter: filter, keepEntry: this.keepListEntry.bind(this) };
		this.beforeStart = period.beforeStart;

		if (period.beforeStart)
		{
			// Nothing exists before the site started; avoid pointless requests.
			this.webRequester.plan = { mode: 'popular', filter: filter, none: true, keepEntry: this.keepListEntry.bind(this) };
		}

		return Rule34HentaiSearch.buildPopularUrl(parsed.popular, period);
	}

	// Cheap checks on what the list page shows, so unwanted posts never cost a detail request.
	keepListEntry(entry)
	{
		if (this.areSomeTagsAreBlacklisted(entry.tags || ''))
			return false;

		if (entry.ext && !this.isPathForSupportedMediaType('x.' + entry.ext))
			return false;

		return true;
	}

	performSearch(searchText, done)
	{
		const url = this.buildRequestUrl(searchText, this.lastPageLoaded + 1);

		if (this.webRequester.plan.none)
		{
			this.hasExhaustedSearch = true;
			done(this);
			return;
		}

		// Reuse the base flow by temporarily pinning the URL.
		const original = this.buildRequestUrl;
		this.buildRequestUrl = () => url;

		try { super.performSearch(searchText, done); }
		finally { this.buildRequestUrl = original; }
	}

	addSlides(responseText)
	{
		let data = null;

		try { data = JSON.parse(responseText); } catch (e) { /* handled below */ }

		if (data == null || !Array.isArray(data.posts))
		{
			this.ranIntoErrorWhileSearching = true;
			this.sitesManager.displayWarningMessage('rule34hentai.net returned a page that could not be read.');
			return;
		}

		let added = 0;

		for (const p of data.posts)
			added += this.addSlide(p) ? 1 : 0;

		const isPopular = this.webRequester.plan && this.webRequester.plan.mode == 'popular';

		if (data.listed == 0)
			this.emptyStreak++;
		else if (added > 0)
			this.emptyStreak = 0;
		else if (isPopular)
			this.emptyStreak++;
		else
			this.emptyStreak = 0;

		if (!isPopular)
			this.hasExhaustedSearch = data.listed == 0;
		else if (this.emptyStreak >= SiteManagerRule34Hentai.MAX_EMPTY_PAGES)
			this.hasExhaustedSearch = true;
	}

	// List searches already carry the rating in the query (server side), so only popular pages are
	// checked here. Many posts are "unrated"; those can't be matched to a rating, so they're shown
	// only when no rating restriction applies.
	isRatingOk(rating)
	{
		const plan = this.webRequester.plan;

		if (!plan || plan.mode != 'popular')
			return true;

		const allowed = this.getAllowedRatings();

		if (rating == 'u')
			return allowed == null || allowed.length == 3;

		return this.isRatingAllowed(rating);
	}

	addSlide(p)
	{
		if (p == null || typeof p != 'object' || typeof p.fileUrl != 'string')
			return false;

		if (!this.isPathForSupportedMediaType(p.fileUrl))
			return false;

		const tags = typeof p.tags == 'string' ? p.tags : '';

		if (this.areSomeTagsAreBlacklisted(tags) || !this.isRatingOk(p.rating))
			return false;

		const id = String(p.id);
		const date = p.dateMs > 0 ? new Date(p.dateMs) : new Date(Number(id) * 1000);

		const before = this.allUnsortedSlides.length;

		this.pushSlideIfSafe(new Slide(
			SITE_RULE34HENTAI, id, p.fileUrl, p.previewUrl || '',
			this.url + '/post/view/' + encodeURIComponent(id),
			Number(p.width), Number(p.height), date, Number(p.score) || 0,
			this.getMediaTypeFromPath(p.fileUrl), p.md5, tags));

		return this.allUnsortedSlides.length > before;
	}

	handleErrorFromSiteResponse(responseText, statusCode, hideVisibleWarning = false)
	{
		this.ranIntoErrorWhileSearching = true;

		if (hideVisibleWarning)
			return;

		let message = 'Error when reading rule34hentai.net.';

		try { message = String(JSON.parse(responseText).message || message); } catch (e) { /* keep default */ }

		this.sitesManager.displayWarningMessage(message);
	}
}
