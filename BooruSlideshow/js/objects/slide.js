class Slide
{
	constructor(siteId, id, fileUrl, previewFileUrl, viewableWebsitePostUrl, width, height, date, score, mediaType, md5, tags)
	{
		this.siteId = siteId;
		this.id = id;
		this.fileUrl = fileUrl;
		this.previewFileUrl = previewFileUrl;
		this.viewableWebsitePostUrl = viewableWebsitePostUrl;
		this.width = width;
		this.height = height;
		this.date = date;
		this.score = score;
		this.mediaType = mediaType;
		this.md5 = md5;
		this.tags = tags;
		this.isPreloaded = false;
		this.isPreloading = false;
		this.hasFailed = false;
		this.preloadingImage = null;
		this.preloadingVideo = null;
		this.callbackToRunAfterPreloadingFinishes = null;
	}

	clone()
	{
		return new Slide(
			this.siteId,
			this.id,
			this.fileUrl,
			this.previewFileUrl,
			this.viewableWebsitePostUrl,
			this.width,
			this.height,
			this.date,
			this.score,
			this.mediaType,
			this.md5,
			this.tags
		);
	}

	preload()
	{
		if (!this.isPreloaded && !this.isPreloading && !this.hasFailed)
		{
			this.isPreloading = true;
			
			if (this.isImageOrGif())
				this.preloadImage();
			else if (this.isVideo())
				this.preloadVideo();
			else
			{
				console.log("Couldn't determine type of media to preload.");
				console.log(this);
			}
		}
	}

	preloadImage()
	{
		var slide = this;
		var image = new Image();
		this.preloadingImage = image;

		image.decoding = 'async';
		image.referrerPolicy = 'no-referrer';

		var finish = function(succeeded){
			image.onload = null;
			image.onerror = null;

			// Drop the reference so decoded pixels can be garbage collected. The file stays in
			// the browser's HTTP cache, so displaying the slide later does not re-download it.
			slide.preloadingImage = null;

			slide.isPreloading = false;
			slide.isPreloaded = succeeded;
			slide.hasFailed = !succeeded;

			// Run the callback on failure too, so a broken slide can't stall a playing slideshow.
			if (slide.callbackToRunAfterPreloadingFinishes != null)
			{
				slide.callbackToRunAfterPreloadingFinishes.call(slide);
			}
		};

		image.onload = function(){ finish(true); };
		image.onerror = function(){ finish(false); };

		resolveMediaUrl(this.fileUrl, function(usableUrl){
			// The slide may already have finished/failed; assigning src is harmless then.
			if (slide.preloadingImage === image)
				image.src = usableUrl;
		});
	}

	preloadVideo()
	{
		var slide = this;
		var video = document.createElement('video');
		this.preloadingVideo = video;

		video.muted = true;
		video.preload = 'auto';

		logForDev('this.preloadingVideo = ' + slide.fileUrl);

		var release = function() {
			video.removeEventListener('loadeddata', onLoaded, false);
			video.removeEventListener('error', onError, false);

			// Pause + removeAttribute + load() is what actually closes the connection and frees the decoder.
			video.pause();
			video.removeAttribute('src');
			video.load();

			slide.preloadingVideo = null;
		};

		var finish = function(succeeded) {
			release();

			slide.isPreloading = false;
			slide.isPreloaded = succeeded;
			slide.hasFailed = !succeeded;

			if (slide.callbackToRunAfterPreloadingFinishes != null)
			{
				slide.callbackToRunAfterPreloadingFinishes.call(slide);
			}
		};

		var onLoaded = function() {
			logForDev('this.preloadingVideo:loadeddata = ' + slide.fileUrl);
			finish(true);
		};

		var onError = function() {
			logForDev('this.preloadingVideo:errored = ' + slide.fileUrl);
			finish(false);
		};

		video.addEventListener('loadeddata', onLoaded, false);
		video.addEventListener('error', onError, false);

		resolveMediaUrl(this.fileUrl, function(usableUrl){
			if (slide.preloadingVideo === video)
			{
				video.src = usableUrl;
				video.load();
			}
		});
	}

	addCallback(callback)
	{
		this.callbackToRunAfterPreloadingFinishes = callback;
	}

	clearCallback()
	{
		this.callbackToRunAfterPreloadingFinishes = null;
	}

	isImageOrGif()
	{
		return this.mediaType == MEDIA_TYPE_IMAGE || this.mediaType == MEDIA_TYPE_GIF;
	}

	isVideo()
	{
		return this.mediaType == MEDIA_TYPE_VIDEO;
	}

	toString()
	{
		return 'Slide ' + this.id + ' ' + this.fileUrl + ' ' + this.fileUrl + ' ' + this.previewFileUrl + ' ' + this.width + ' ' + this.height;
	}
}