// booru.allthefallen.moe (ATFBooru)
//
// A Danbooru-style site, so this follows SiteManagerDanbooru (posts.json, 1-based `page`, `limit`),
// plus an account username + API key sent as the `login` and `api_key` query parameters, the same
// way Gelbooru and rule34.xxx send theirs. Anonymous requests are rejected by the site (401).
//
// The site sits behind an anti-bot check. When it answers with an HTML page instead of JSON, the
// user is told to pass the check in Firefox first instead of seeing a confusing parse error.
class SiteManagerAtfBooru extends SiteManager
{
	constructor(sitesManager, pageLimit)
	{
		super(sitesManager, SITE_ATFBOORU, 'https://booru.allthefallen.moe', pageLimit);

		// The site's anti-bot check is remembered in a cookie. Sending the browser's cookies for this
		// site (only this site) lets a check you already passed in Firefox count for extension requests.
		this.webRequester.withCredentials = true;
	}

	getUsername()
	{
		return (this.sitesManager.model.atfUsername || '').trim();
	}

	// API keys are plain tokens. If someone pastes a whole query string from the site
	// ("api_key=XYZ&login=name" or "XYZ&login=name"), keep only the key.
	getApiKey()
	{
		var key = (this.sitesManager.model.atfApiKey || '').trim();

		key = key.replace(/^\??api_key=/i, '');

		return key.split(/[&\s]/)[0];
	}

	requiresCredentials()
	{
		return true;
	}

	hasCredentials()
	{
		return this.getUsername() != '' && this.getApiKey() != '';
	}

	getMissingCredentialsMessage()
	{
		return 'booru.allthefallen.moe requires your username and an API key. Enter them under Sites (the key is in your account settings on the site).';
	}

	getSecrets()
	{
		return [this.getApiKey(), this.getUsername()];
	}

	buildCredentialString()
	{
		return '&login=' + encodeURIComponent(this.getUsername()) + '&api_key=' + encodeURIComponent(this.getApiKey());
	}

	buildPingRequestUrl()
	{
		if (!this.hasCredentials())
			return null;

		return this.url + '/posts.json?limit=1' + this.buildCredentialString();
	}

	buildRequestUrl(searchText, pageNumber)
	{
		if (!this.hasCredentials())
			return null;

		var query = this.buildSiteSpecificQuery(searchText);

		return this.url + '/posts.json?tags=' + encodeURIComponent(query) +
			'&page=' + pageNumber + '&limit=' + this.pageLimit + this.buildCredentialString();
	}

	static looksLikeHtml(text)
	{
		return typeof text == 'string' && /^\s*<(!doctype|html|head|body|script)/i.test(text);
	}

	getAntiBotMessage()
	{
		return 'booru.allthefallen.moe answered with a web page instead of data, which is usually its anti-bot check. ' +
			'Open https://booru.allthefallen.moe in Firefox, let the check finish, then try again.';
	}

	describeOfflineResponse(responseText)
	{
		if (SiteManagerAtfBooru.looksLikeHtml(responseText))
			return this.getAntiBotMessage();

		return 'booru.allthefallen.moe answered but not with any posts. Check your username and API key under Sites.';
	}

	// Returns the parsed array of posts, or null if the body is not a JSON array of posts.
	parsePosts(responseText)
	{
		if (typeof responseText != 'string' || responseText.trim() == '')
			return null;

		try
		{
			var parsed = JSON.parse(responseText);

			return Array.isArray(parsed) ? parsed : null;
		}
		catch (e)
		{
			return null;
		}
	}

	doesResponseTextIndicateOnline(responseText)
	{
		var posts = this.parsePosts(responseText);

		return posts != null && posts.length > 0;
	}

	handleErrorFromSiteResponse(responseText, statusCode, hideVisibleWarning = false)
	{
		if (SiteManagerAtfBooru.looksLikeHtml(responseText))
		{
			this.ranIntoErrorWhileSearching = true;

			if (!hideVisibleWarning)
				this.sitesManager.displayWarningMessage(this.getAntiBotMessage());

			return;
		}

		super.handleErrorFromSiteResponse(responseText, statusCode, hideVisibleWarning);
	}

	addSlides(responseText)
	{
		var posts = this.parsePosts(responseText);

		if (posts == null)
		{
			// A 200 that isn't a post list: the anti-bot page, or an error object such as {"success":false,...}.
			this.ranIntoErrorWhileSearching = true;

			if (SiteManagerAtfBooru.looksLikeHtml(responseText))
				this.sitesManager.displayWarningMessage(this.getAntiBotMessage());
			else
				this.sitesManager.displayWarningMessage('booru.allthefallen.moe returned an unexpected response. Check your username and API key under Sites.');

			return;
		}

		this.hasExhaustedSearch = (posts.length < this.pageLimit);

		for (var i = 0; i < posts.length; i++)
		{
			if (posts[i] != null && typeof posts[i] == 'object')
				this.addSlide(posts[i]);
		}
	}

	addSlide(jsonPost)
	{
		// Posts the account may not see come back without file_url.
		if (typeof jsonPost.file_url != 'string' || typeof jsonPost.preview_file_url != 'string')
			return;

		if (!this.isPathForSupportedMediaType(jsonPost.file_url))
			return;

		var tags = typeof jsonPost.tag_string == 'string' ? jsonPost.tag_string : '';

		if (this.areSomeTagsAreBlacklisted(tags))
			return;

		if (!this.isRatingAllowed(jsonPost.rating))
			return;

		var date = new Date(jsonPost.created_at);

		var newSlide = new Slide(
			SITE_ATFBOORU,
			jsonPost.id,
			jsonPost.file_url,
			jsonPost.preview_file_url,
			this.url + '/posts/' + encodeURIComponent(jsonPost.id),
			Number(jsonPost.image_width),
			Number(jsonPost.image_height),
			isNaN(date.getTime()) ? new Date(0) : date,
			Number(jsonPost.score),
			this.getMediaTypeFromPath(jsonPost.file_url),
			jsonPost.md5,
			tags
		);

		// Relative paths are resolved against this.url and everything must be https.
		this.pushSlideIfSafe(newSlide);
	}
}
