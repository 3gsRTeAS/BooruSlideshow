class SiteManager
{
    constructor(sitesManager, id, url, pageLimit)
    {
		this.webRequester = new WebRequester();
        this.sitesManager = sitesManager;
        this.id = id;
        this.url = url;
        this.pageLimit = pageLimit;
        this.lastPageLoaded = 0;
        this.isEnabled = false;
        this.allUnsortedSlides = [];
        this.hasExhaustedSearch = false;
        this.ranIntoErrorWhileSearching = false;
        this.isOnline = false;
        
        this.siteQueryTermAssociations = SITE_QUERY_TERM_ASSOCIATIONS[id];
    }
    
    buildPingRequestUrl()
	{
		console.log('buildPingRequestUrl() was not implemented.');
    }
    
    buildRequestUrl(searchText, pageNumber)
	{
		console.log('buildRequestUrl() was not implemented.');
	}
    
    buildSiteSpecificQuery(searchText)
	{
		var query = searchText.trim();
		
		for (var queryTermToReplace in this.siteQueryTermAssociations)
		{
			var queryTermReplacement = this.siteQueryTermAssociations[queryTermToReplace];
			
			var queryTermRegexp = new RegExp(queryTermToReplace, 'i');
			
			query = query.replace(queryTermRegexp, queryTermReplacement);
		}
		
		return query;
	}

	resetConnection()
	{
		this.webRequester.resetConnection();
		
		this.lastPageLoaded = 0;
		this.isEnabled = false;
		this.allUnsortedSlides = [];
		this.hasExhaustedSearch = false;
		this.ranIntoErrorWhileSearching = false;
	}

	enable()
	{
		this.isEnabled = true;
	}

	// showErrors: set when the user just did something (e.g. typed credentials) so a failure should
	// be explained on screen. The startup check stays quiet.
	pingStatus(callback, showErrors = false)
	{
		var url = this.buildPingRequestUrl();
		
		if (url != null)
		{
			var _this = this;
			this.webRequester.makeWebsiteRequest(
				url,
				function(responseText){
					if (_this.doesResponseTextIndicateOnline(responseText))
						_this.isOnline = true;
					else if (showErrors)
						_this.sitesManager.displayWarningMessage(_this.describeOfflineResponse(responseText));
				},
				function(responseText, statusCode){
					_this.handleErrorFromSiteResponse(responseText, statusCode, !showErrors);
				},
				function(){
					callback(_this);
				},
				function(url){
					_this.handleGeneralError(url, !showErrors);
					callback(_this);
				},
				true);
		}
		else
		{
			callback(this);
		}
	}

	// Explains a 200 response that did not look like a working site. Sites can give a better reason.
	describeOfflineResponse(responseText)
	{
		return this.url + ' answered, but not with any posts.';
	}

	// Sites that need an account's API credentials override these.
	requiresCredentials()
	{
		return false;
	}

	hasCredentials()
	{
		return true;
	}

	getMissingCredentialsMessage()
	{
		return '';
	}

	// Every slide goes through here so remote URLs are validated in one place.
	pushSlideIfSafe(slide)
	{
		var fileUrl = sanitizeHttpsUrl(slide.fileUrl, this.url);

		if (fileUrl == null)
		{
			logForDev('Skipping post ' + slide.id + ' because its file URL is not a valid https URL.');
			return;
		}

		slide.fileUrl = fileUrl;
		slide.previewFileUrl = sanitizeHttpsUrl(slide.previewFileUrl, this.url) || (slide.isImageOrGif() ? fileUrl : '');
		slide.viewableWebsitePostUrl = sanitizeHttpsUrl(slide.viewableWebsitePostUrl, this.url) || this.url;

		this.allUnsortedSlides.push(slide);
	}

	doesResponseTextIndicateOnline(responseText)
	{
		console.log('doesResponseTextIndicateOnline() was not implemented.');
	}

	performSearch(searchText, doneSearchingSiteCallback)
	{
		if (!this.isOnline)
		{
			console.log('Trying to perform search on site that has not been determined to be online.');
			return;
		}

		this.ranIntoErrorWhileSearching = false;
		var pageNumber = this.lastPageLoaded + 1;
		var url = this.buildRequestUrl(searchText, pageNumber);
		
		var siteManager = this;
		
		if (url != null)
		{
			this.webRequester.makeWebsiteRequest(
				url,
				function(responseText){
					siteManager.lastPageLoaded++;

					logForDev(responseText);

					siteManager.addSlides(responseText);
				},
				this.handleErrorFromSiteResponse.bind(siteManager),
				function(){
					doneSearchingSiteCallback(siteManager);
				},
				this.handleGeneralError.bind(siteManager),
			);
		}
	}

	handleErrorFromSiteResponse(responseText, statusCode, hideVisibleWarning = false)
	{
		this.ranIntoErrorWhileSearching = true;
		
		var warningMessage = 'Error when calling site ' + this.url;
		responseText = this.redactSecrets(responseText);
		
		var possibleJson = '';
		
		try
		{
			possibleJson = JSON.parse(responseText);
		}
		catch (e)
		{
			console.log('status code = ' + statusCode);

			if (statusCode != 400)
			{
				// Response bodies can echo request parameters, so only log a short, redacted piece.
				console.log(String(responseText).substring(0, 200));
			}
			
			possibleJson = null;
		}
		
		if (possibleJson != null && possibleJson.message != null)
		{
			warningMessage += ': ' + this.redactSecrets(String(possibleJson.message));
		}
		
		if (statusCode == 429)
        {
			warningMessage += ' Requests were made too quickly. (Likely from the initial site status check.) Please try again.';
        }
		
        if (!hideVisibleWarning)
            this.sitesManager.displayWarningMessage(warningMessage);
	}

	handleGeneralError(url, hideVisibleWarning = false)
	{
		if (!hideVisibleWarning)
			this.sitesManager.displayWarningMessage('Error making the request to ' + redactUrl(url));
	}

	// Secrets known to this site manager (API keys etc.). Overridden by sites that have any.
	getSecrets()
	{
		return [];
	}

	redactSecrets(text)
	{
		return redactSecretsInText(text, this.getSecrets());
	}

	addSlides(responseText)
	{
		console.log('addSlides() was not implemented.');
	}

	addXmlSlides(xmlResponseText)
	{
		var parser = new DOMParser();
		var xml = parser.parseFromString(xmlResponseText, "text/xml");
		
		var xmlPosts = xml.getElementsByTagName("post");
		
		this.hasExhaustedSearch = (xmlPosts.length < this.pageLimit);
		
		for (var i = 0; i < xmlPosts.length; i++)
		{
			var xmlPost = xmlPosts[i];
			
			logForDev(xmlPost);

			this.addSlide(xmlPost);
		}
	}

	addJsonSlides(jsonResponseText)
	{
		var jsonPosts;
		
		try
		{
			jsonPosts = JSON.parse(jsonResponseText);
		}
		catch(e)
		{
			console.log("JSON failed to parse.");
			console.log(e);
			return;
		}
		
		this.hasExhaustedSearch = (jsonPosts.length < this.pageLimit);

		for (var i = 0; i < jsonPosts.length; i++)
		{
			var jsonPost = jsonPosts[i];
			
			logForDev(jsonPost);

			this.addSlide(jsonPost);
		}
	}

	addSlide(jsonOrXmlPost)
	{
		console.log('addSlide() was not implemented.');
	}

	hasntExhaustedSearch()
	{
		return this.isEnabled && !this.hasExhaustedSearch && !this.ranIntoErrorWhileSearching;
	}

	convertSDateToDate(sDate)
	{
		//console.log('passed in ' + sDate);
		return new Date(sDate * 1000);
	}

	isPathForSupportedMediaType(filePath)
	{
		if (filePath == null)
		{
			console.log("Trying to figure out the media type of a null file path.");
			return;
		}

		var mediaType = this.getMediaTypeFromPath(filePath)
		
		return this.isMediaTypeSupported(mediaType);
	}

	getMediaTypeFromPath(filePath)
	{
		// Some sites append cache-busting query strings (".webm?123"); judge by the path only.
		filePath = filePath.split(/[?#]/)[0];

		var fileExtension = filePath.substring(filePath.length - 4);
		
		switch (fileExtension.toLowerCase())
		{
			case 'webm':
			case '.mp4':
				return MEDIA_TYPE_VIDEO;
			case '.gif':
				return MEDIA_TYPE_GIF;
			case '.swf':
			case '.zip':
				return MEDIA_TYPE_UNSUPPORTED;
			default:
				return MEDIA_TYPE_IMAGE;
		}
	}

	isMediaTypeSupported(mediaType)
	{
		return (mediaType == MEDIA_TYPE_IMAGE && this.sitesManager.model.includeImages) ||
			(mediaType == MEDIA_TYPE_GIF && this.sitesManager.model.includeGifs) ||
			(mediaType == MEDIA_TYPE_VIDEO && this.sitesManager.model.includeWebms);
	}

	isRatingAllowed(rating)
	{
		if (!this.sitesManager.model.includeExplicit && !this.sitesManager.model.includeQuestionable && !this.sitesManager.model.includeSafe)
			return true;
		
		return (rating == "e" && this.sitesManager.model.includeExplicit) || 
			(rating == "q" && this.sitesManager.model.includeQuestionable) ||
			(rating == "s" && this.sitesManager.model.includeSafe);
	}

	areSomeTagsAreBlacklisted(tags)
	{
		return this.sitesManager.model.areSomeTagsAreBlacklisted(tags);
	}

	reformatFileUrl(url)
	{
		if (url.substring(0,2) == '//')
		{
			url = 'https:' + url;
		}
		
		return url;
	}
}