// rule34.xxx
//
// Modeled on SiteManagerGelbooru: Gelbooru-style "dapi" XML, 0-based `pid` paging, and an
// account API key + user ID appended to every request. rule34.xxx now serves the API from
// api.rule34.xxx and answers requests that lack credentials with a plain-text
// "Missing authentication" message instead of posts.
class SiteManagerRule34 extends SiteManager
{
	constructor(sitesManager, pageLimit)
	{
		super(sitesManager, SITE_RULE34, 'https://rule34.xxx', pageLimit);

		// Posts are *viewed* on this.url, but the API lives on its own host.
		this.apiUrl = 'https://api.rule34.xxx';
	}

	getUserId()
	{
		return (this.sitesManager.model.rule34UserId || '').trim();
	}

	getApiKey()
	{
		return (this.sitesManager.model.rule34ApiKey || '').trim();
	}

	requiresCredentials()
	{
		return true;
	}

	hasCredentials()
	{
		return this.getUserId() != '' && this.getApiKey() != '';
	}

	getMissingCredentialsMessage()
	{
		return 'rule34.xxx requires an API key and user ID. Enter them under Sites (they are on your rule34.xxx account options page).';
	}

	getSecrets()
	{
		return [this.getApiKey(), this.getUserId()];
	}

	buildCredentialString()
	{
		return '&user_id=' + encodeURIComponent(this.getUserId()) + '&api_key=' + encodeURIComponent(this.getApiKey());
	}

	buildPingRequestUrl()
	{
		if (!this.hasCredentials())
			return null;

		return this.apiUrl + '/index.php?page=dapi&s=post&q=index&limit=1' + this.buildCredentialString();
	}

	buildRequestUrl(searchText, pageNumber)
	{
		if (!this.hasCredentials())
			return null;

		var query = this.buildSiteSpecificQuery(searchText);

		// pid is 0-based; pageLimit is capped by the API (1000), the app uses 100 like the other boorus.
		return this.apiUrl + '/index.php?page=dapi&s=post&q=index&tags=' + encodeURIComponent(query) +
			'&pid=' + (pageNumber - 1) + '&limit=' + this.pageLimit + this.buildCredentialString();
	}

	parsePostsDocument(responseText)
	{
		if (typeof responseText != 'string' || responseText.trim() == '')
			return null;

		var xml = new DOMParser().parseFromString(responseText, 'text/xml');

		if (xml.getElementsByTagName('parsererror').length > 0)
			return null;

		if (xml.getElementsByTagName('posts').length == 0)
			return null;

		return xml;
	}

	doesResponseTextIndicateOnline(responseText)
	{
		var xml = this.parsePostsDocument(responseText);

		return xml != null && xml.getElementsByTagName('post').length > 0;
	}

	isAuthenticationFailure(responseText)
	{
		return typeof responseText == 'string' && /authentication|api[ _-]?key|user[ _-]?id/i.test(responseText.substring(0, 300));
	}

	addSlides(responseText)
	{
		var xml = this.parsePostsDocument(responseText);

		if (xml == null)
		{
			// The API answers HTTP 200 even for auth problems, so this is the only place it can be noticed.
			this.ranIntoErrorWhileSearching = true;

			if (this.isAuthenticationFailure(responseText))
				this.sitesManager.displayWarningMessage('rule34.xxx rejected the API key or user ID. Check them under Sites.');
			else
				this.sitesManager.displayWarningMessage('rule34.xxx returned an unexpected response.');

			return;
		}

		this.addXmlSlides(responseText);
	}

	parseDate(xmlPost)
	{
		var date = new Date(xmlPost.getAttribute('created_at'));

		if (isNaN(date.getTime()))
		{
			// `change` is a Unix timestamp
			var change = parseInt(xmlPost.getAttribute('change'), 10);
			date = isNaN(change) ? new Date(0) : new Date(change * 1000);
		}

		return date;
	}

	addSlide(xmlPost)
	{
		if (!xmlPost.hasAttribute('file_url') ||
			!xmlPost.hasAttribute('preview_url'))
			return;

		var fileUrl = xmlPost.getAttribute('file_url');

		if (!this.isPathForSupportedMediaType(fileUrl))
			return;

		var tags = xmlPost.getAttribute('tags') || '';

		if (this.areSomeTagsAreBlacklisted(tags))
			return;

		if (!this.isRatingAllowed(xmlPost.getAttribute('rating')))
			return;

		var id = xmlPost.getAttribute('id');

		var newSlide = new Slide(
			SITE_RULE34,
			id,
			this.reformatFileUrl(fileUrl),
			this.reformatFileUrl(xmlPost.getAttribute('preview_url')),
			this.url + '/index.php?page=post&s=view&id=' + encodeURIComponent(id),
			Number(xmlPost.getAttribute('width')),
			Number(xmlPost.getAttribute('height')),
			this.parseDate(xmlPost),
			Number(xmlPost.getAttribute('score')),
			this.getMediaTypeFromPath(fileUrl),
			xmlPost.getAttribute('md5'),
			tags
		);

		this.pushSlideIfSafe(newSlide);
	}
}
