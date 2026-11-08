class SlideshowModel{
    constructor()
    {
        this.view = null;
        
        this.videoVolume = 0;
        this.videoMuted = false;
        
        this.searchText = "";
        
        this.sitesToSearch = {
            [SITE_ATFBOORU]: false,
            [SITE_GELBOORU]: false,
            [SITE_RULE34]: false,
            [SITE_RULE34HENTAI]: true
        };

        this.secondsPerSlide = 6;
        this.maxWidth = null;
        this.maxHeight = null;
        this.autoFitSlide = true;
        this.includeImages = true;
        this.includeGifs = true;
        this.includeWebms = true;
        this.includeExplicit = false;
        this.includeQuestionable = false;
        this.includeSafe = true;
        this.hideBlacklist = false;
        this.blacklist = '';
        this.gelbUserId = ''
        this.gelbApiKey = ''
        this.atfUsername = '';
        this.atfApiKey = '';
        this.rule34UserId = '';
        this.rule34ApiKey = '';
        this.storeHistory = true;
        this.searchHistory = [];

        this.isPlaying = false;
        this.timer = null;
        this.timerMs = 0;

        this.sitesManager = null;

        this.personalList = new PersonalList();

        this.currentSlideChangedEvent = new Event(this);
        this.playingChangedEvent = new Event(this);
        this.videoVolumeUpdatedEvent = new Event(this);
        this.sitesToSearchUpdatedEvent = new Event(this);
        this.secondsPerSlideUpdatedEvent = new Event(this);
        this.maxWidthUpdatedEvent = new Event(this);
        this.maxHeightUpdatedEvent = new Event(this);
        this.autoFitSlideUpdatedEvent = new Event(this);
        this.includeImagesUpdatedEvent = new Event(this);
        this.includeGifsUpdatedEvent = new Event(this);
        this.includeWebmsUpdatedEvent = new Event(this);
        this.includeExplicitUpdatedEvent = new Event(this);
        this.includeQuestionableUpdatedEvent = new Event(this);
        this.includeSafeUpdatedEvent = new Event(this);
        this.hideBlacklistUpdatedEvent = new Event(this);
        this.blacklistUpdatedEvent = new Event(this);
        this.gelbUserIdUpdatedEvent = new Event(this);
        this.gelbApiKeyUpdatedEvent = new Event(this);
        this.atfUsernameUpdatedEvent = new Event(this);
        this.atfApiKeyUpdatedEvent = new Event(this);
        this.rule34UserIdUpdatedEvent = new Event(this);
        this.rule34ApiKeyUpdatedEvent = new Event(this);
        this.storeHistoryUpdatedEvent = new Event(this);
        this.searchHistoryUpdatedEvent = new Event(this);
        this.favoriteButtonUpdatedEvent = new Event(this);
        this.includeDupesUpdatedEvent = new Event(this);

        this.dataLoader = new DataLoader(this);

        this.initialize();
    }

    initialize()
    {
        var numberOfSlidesToAlwaysHaveReadyToDisplay = 20;
        var maxNumberOfThumbnails = 10;

        this.sitesManager = new SitesManager(this, numberOfSlidesToAlwaysHaveReadyToDisplay, maxNumberOfThumbnails);
		
		var standardPageLimit = 100;
		
        this.sitesManager.addSite(SITE_ATFBOORU, standardPageLimit);
        this.sitesManager.addSite(SITE_GELBOORU, standardPageLimit);
        this.sitesManager.addSite(SITE_RULE34, standardPageLimit);
        this.sitesManager.addSite(SITE_RULE34HENTAI, standardPageLimit);
    }

    async loadUserSettings()
    {
        //console.log("SlideshowModel.loadUserSettings")
        let result = await this.dataLoader.loadUserSettings();
    }
	
    pingSites()
    {
        console.log("Checking status of sites...");

		var _this = this;
		this.sitesManager.pingSites(function(siteManager){
			if (!siteManager.isOnline)
				_this.view.showSiteOffline(siteManager.id);
		});
	}

    performSearch(searchText)
    {
        this.sitesManager.resetConnections();

        var selectedSites = this.getSelectedSitesToSearch();
        this.sitesManager.enableSites(selectedSites);

        var _this = this;

        this.sitesManager.performSearch(searchText, function () {
			_this.view.clearInfoMessage();
            _this.currentSlideChangedEvent.notify();
        });

        this.storeSearchHistory(searchText);
    }

    storeSearchHistory(searchText)
    {
        if (!this.storeHistory)
            return;
            
        if (searchText == null || searchText.length == 0)
            return;
        
        if (this.searchHistory.includes(searchText))
        {
            var index = this.searchHistory.indexOf(searchText)

            if (index == 0)
                return;

            this.searchHistory.splice(index, 1);
            this.searchHistory.unshift(searchText);
        }
        else
        {
            this.searchHistory.unshift(searchText);
            this.searchHistory = this.searchHistory.slice(0, 100);
        }

        this.dataLoader.saveSearchHistory();

        this.searchHistoryUpdatedEvent.notify();
    }
	
    areSomeTagsAreBlacklisted(tags)
    {
        if (!tags)
            return false;

        if (this.blacklistCacheSource !== this.blacklist)
        {
            this.blacklistCacheSource = this.blacklist;
            this.blacklistTagSet = new Set(
                this.blacklist.trim().split(/\s+/).filter(tag => tag != ''));
        }

        if (this.blacklistTagSet.size == 0)
            return false;

        for (let postTag of tags.trim().split(/\s+/))
        {
            if (this.blacklistTagSet.has(postTag))
                return true;
        }

        return false;
    }

    setSlideNumberToFirst()
    {
        this.sitesManager.moveToFirstSlide();
        this.currentSlideChangedEvent.notify();

        this.restartSlideshowIfOn();
    }

    decreaseCurrentSlideNumber()
    {
        if (!this.sitesManager.canDecreaseCurrentSlideNumber())
        {
            return;
        }

        this.sitesManager.decreaseCurrentSlideNumber();
        this.currentSlideChangedEvent.notify();

        this.restartSlideshowIfOn();
    }

    increaseCurrentSlideNumber()
    {
        var _this = this;

        this.sitesManager.increaseCurrentSlideNumber(function () {
            _this.currentSlideChangedEvent.notify();
        });

        this.restartSlideshowIfOn();
    }
	
    decreaseCurrentSlideNumberByTen()
    {
        if (!this.sitesManager.canDecreaseCurrentSlideNumber())
        {
            return;
        }
        
        this.sitesManager.decreaseCurrentSlideNumberByTen();
        this.currentSlideChangedEvent.notify();

        this.restartSlideshowIfOn();
    }
	
    increaseCurrentSlideNumberByTen()
    {
        var _this = this;

        this.sitesManager.increaseCurrentSlideNumberByTen(function () {
            _this.currentSlideChangedEvent.notify();
        });

        this.restartSlideshowIfOn();
    }

    setSlideNumberToLast()
    {
        var _this = this;

        this.sitesManager.moveToLastSlide(function () {
            _this.currentSlideChangedEvent.notify();
        });

        this.restartSlideshowIfOn();
    }

    moveToThumbnailSlide(id)
    {
        if (this.sitesManager.moveToThumbnailSlide(id))
        {
            this.currentSlideChangedEvent.notify();
            //restartSlideshowIfOn();
        }
    }

    preloadNextUnpreloadedSlideAfterThisOneIfInRange(slide)
    {
        this.sitesManager.preloadNextUnpreloadedSlideAfterThisOneIfInRange(slide);
    }

    tryToPlayOrPause()
    {
        if (this.hasSlidesToDisplay())
        {
            if (this.isPlaying)
                this.pauseSlideshow();
            else
                this.startSlideshow();
        }
    }

    startSlideshow()
    {
        this.tryToStartCountdown();

        this.isPlaying = true;

        this.playingChangedEvent.notify();
    }

    tryToStartCountdown()
    {
        if (this.sitesManager.isCurrentSlideLoaded())
        {
            this.startCountdown();
        }
        else
        {
            var _this = this;

            this.sitesManager.runCodeWhenCurrentSlideFinishesLoading(function(){
                _this.startCountdown();
            });
        }
    }

    startCountdown()
    {
        var millisecondsPerSlide = this.secondsPerSlide * 1000;
	    
        var _this = this;

        this.timer = setTimeout(function() {
            if (_this.hasNextSlide())
            {
                // Continue slideshow
                _this.increaseCurrentSlideNumber();
            }
            else if (_this.isTryingToLoadMoreSlides())
            {
                // Wait for loading images/videos to finish
                _this.sitesManager.runCodeWhenFinishGettingMoreSlides(function(){
                    _this.tryToStartCountdown();
                });
            }
            else
            {
                // Loop when out of images/videos
                _this.setSlideNumberToFirst();
            }
		
        }, millisecondsPerSlide);
    }

    restartSlideshowIfOn()
    {
        
        if (this.isPlaying)
        {
            clearTimeout(this.timer);
            this.sitesManager.clearCallbacksForPreloadingSlides();
		
            this.tryToStartCountdown();
        }
    }

    pauseSlideshow()
    {
        clearTimeout(this.timer);
        this.sitesManager.clearCallbacksForPreloadingSlides();
        this.sitesManager.clearCallbacksForLoadingSlides();

        this.isPlaying = false;

        this.playingChangedEvent.notify();
    }

    hasAtLeastOneOnlineSiteSelected()
    {
        this.sitesManager.resetConnections();

        var selectedSites = this.getSelectedSitesToSearch();
        this.sitesManager.enableSites(selectedSites);

        return this.sitesManager.hasAtLeastOneOnlineSiteSelected();
    }

    getSlideCount()
    {
        return this.sitesManager.getTotalSlideNumber();
    }

    hasSlidesToDisplay()
    {
        return (this.getSlideCount() > 0);
    }

    hasNextSlide()
    {
        return (this.getSlideCount() > this.getCurrentSlideNumber());
    }

    isTryingToLoadMoreSlides()
    {
        return this.sitesManager.isTryingToLoadMoreSlides;
    }

    getCurrentSlide()
    {
        return this.sitesManager.getCurrentSlide();
    }

    getCurrentSlideNumber()
    {
        return this.sitesManager.currentSlideNumber;
    }

    areThereMoreLoadableSlides()
    {
        return this.sitesManager.areThereMoreLoadableSlides();
    }

    getNextSlidesForThumbnails()
    {
        return this.sitesManager.getNextSlidesForThumbnails();
    }

    getSelectedSitesToSearch()
    {
        var selectedSitesToSearch = [];

        for (var siteToSearch in this.sitesToSearch)
        {
            if (this.sitesToSearch[siteToSearch])
            {
                selectedSitesToSearch.push(siteToSearch);
            }
        }

        return selectedSitesToSearch;
    }

    areMaxWithAndHeightEnabled()
    {
        return !this.autoFitSlide;
    }
	
    setVideoVolume(volume)
    {
        this.videoVolume = volume;

        this.dataLoader.saveVideoVolume();

        this.videoVolumeUpdatedEvent.notify();
    }
	
    setVideoMuted(muted)
    {
        this.videoMuted = muted;

        this.dataLoader.saveVideoMuted();

        this.videoVolumeUpdatedEvent.notify();
    }

    setSitesToSearch(sitesToSearch)
    {
        this.sitesToSearch = sitesToSearch;

        this.dataLoader.saveSitesToSearch();

        this.sitesToSearchUpdatedEvent.notify();
    }

    setSiteToSearch(site, checked)
    {
        this.sitesToSearch[site] = checked;

        this.dataLoader.saveSitesToSearch();

        this.sitesToSearchUpdatedEvent.notify();
    }
	
    setSecondsPerSlide(secondsPerSlide)
    {
        this.secondsPerSlide = secondsPerSlide;

        this.dataLoader.saveSecondsPerSlide();

        this.secondsPerSlideUpdatedEvent.notify();
    }
	
    setSecondsPerSlideIfValid(secondsPerSlide)
    {
		if (secondsPerSlide == '')
            return;

        if (isNaN(secondsPerSlide))
            return;

        if (secondsPerSlide < 1)
            return;

        this.setSecondsPerSlide(secondsPerSlide);
	}

    setMaxWidth(maxWidth)
    {
        this.maxWidth = maxWidth;

        this.dataLoader.saveMaxWidth();

        this.maxWidthUpdatedEvent.notify();
    }

    setMaxHeight(maxHeight)
    {
        this.maxHeight = maxHeight;

        this.dataLoader.saveMaxHeight();

        this.maxHeightUpdatedEvent.notify();
    }

    setAutoFitSlide(onOrOff)
    {
        this.autoFitSlide = onOrOff;

        this.dataLoader.saveAutoFitSlide();

        this.autoFitSlideUpdatedEvent.notify();
    }
	
    setIncludeImages(onOrOff)
    {
        this.includeImages = onOrOff;

        this.dataLoader.saveIncludeImages();

        this.includeImagesUpdatedEvent.notify();
    }
	
    setIncludeGifs(onOrOff)
    {
        this.includeGifs = onOrOff;

        this.dataLoader.saveIncludeGifs();

        this.includeGifsUpdatedEvent.notify();
    }
	
    setIncludeWebms(onOrOff)
    {
        this.includeWebms = onOrOff;

        this.dataLoader.saveIncludeWebms();

        this.includeWebmsUpdatedEvent.notify();
    }

    setIncludeExplicit(onOrOff){
        this.includeExplicit = onOrOff;

        this.dataLoader.saveIncludeExplicit();

        this.includeExplicitUpdatedEvent.notify();
    }

    setIncludeQuestionable(onOrOff){
        this.includeQuestionable = onOrOff;

        this.dataLoader.saveIncludeQuestionable();

        this.includeQuestionableUpdatedEvent.notify();
    }

    setIncludeSafe(onOrOff){
        this.includeSafe = onOrOff;

        this.dataLoader.saveIncludeSafe();

        this.includeSafeUpdatedEvent.notify();
    }

    setIncludeDupes(onOrOff){
        this.includeDupes = onOrOff;

        this.dataLoader.saveIncludeDupes();

        this.includeDupesUpdatedEvent.notify();
    }
	
    setHideBlacklist(onOrOff)
    {
        this.hideBlacklist = onOrOff;

        this.dataLoader.saveHideBlacklist();

        this.hideBlacklistUpdatedEvent.notify();
    }

    setBlacklist(blacklist)
    {
        this.blacklist = blacklist;

        this.dataLoader.saveBlacklist();

        this.blacklistUpdatedEvent.notify();
    }
	
    setGelbUserId(gelbUserId)
    {
        this.gelbUserId = gelbUserId;

        this.dataLoader.saveGelbUserId();

        this.gelbUserIdUpdatedEvent.notify();
    }

    setGelbApiKey(gelbApiKey)
    {
        this.gelbApiKey = gelbApiKey;

        this.dataLoader.saveGelbApiKey();

        this.gelbApiKeyUpdatedEvent.notify();
    }

    setAtfUsername(atfUsername)
    {
        this.atfUsername = atfUsername;

        this.dataLoader.saveAtfUsername();

        this.atfUsernameUpdatedEvent.notify();
    }

    setAtfApiKey(atfApiKey)
    {
        this.atfApiKey = atfApiKey;

        this.dataLoader.saveAtfApiKey();

        this.atfApiKeyUpdatedEvent.notify();
    }

    setRule34UserId(rule34UserId)
    {
        this.rule34UserId = rule34UserId;

        this.dataLoader.saveRule34UserId();

        this.rule34UserIdUpdatedEvent.notify();
    }

    setRule34ApiKey(rule34ApiKey)
    {
        this.rule34ApiKey = rule34ApiKey;

        this.dataLoader.saveRule34ApiKey();

        this.rule34ApiKeyUpdatedEvent.notify();
    }

    // Selected sites that need an API key / user ID the user hasn't entered yet.
    getSelectedSitesMissingCredentials()
    {
        return this.sitesManager.siteManagers.filter(
            (siteManager) => this.sitesToSearch[siteManager.id] &&
                siteManager.requiresCredentials() &&
                !siteManager.hasCredentials());
    }

    // Sites that depend on the user's own browser tab (rule34hentai.net) can come online after the
    // startup check. Re-checks the selected ones that are offline, then calls done(wasAnyChecked).
    recheckSelectedOfflineSites(done)
    {
        var _this = this;
        var sites = this.sitesManager.siteManagers.filter(
            (sm) => this.sitesToSearch[sm.id] && !sm.isOnline && typeof sm.isRecheckable == 'function' && sm.isRecheckable());

        if (sites.length == 0)
        {
            done(false);
            return;
        }

        var remaining = sites.length;

        sites.forEach(function (sm) {
            sm.pingStatus(function (pinged) {
                _this.view.showSiteOnlineStatus(pinged.id, pinged.isOnline);
                remaining--;

                if (remaining == 0)
                    done(true);
            }, true);
        });
    }

    // Credentials changed, so the site's online status may have changed too.
    repingSite(siteId)
    {
        var _this = this;
        var siteManager = this.sitesManager.siteManagers.find(sm => sm.id == siteId);

        if (siteManager == null)
            return;

        siteManager.isOnline = false;
        siteManager.pingStatus(function (pingedSiteManager) {
            _this.view.showSiteOnlineStatus(pingedSiteManager.id, pingedSiteManager.isOnline);
        }, true);
    }

    setStoreHistory(onOrOff)
    {
        this.storeHistory = onOrOff;

        this.dataLoader.saveStoreHistory();

        this.storeHistoryUpdatedEvent.notify();
    }

    setSearchHistory(searchHistory)
    {
        this.searchHistory = searchHistory;

        this.dataLoader.saveSearchHistory();

        this.searchHistoryUpdatedEvent.notify();
    }

    setPersonalList(personalList)
    {
        this.personalList = personalList;

        this.dataLoader.savePersonalList();
    }

    toggleSlideFave()
    {
        let currentSlide = this.getCurrentSlide();

        if (currentSlide == null)
            return;

        if (this.isCurrentSlideFaved())
        {
            this.personalList.tryToRemove(currentSlide);
        }
        else
        {
            this.personalList.tryToAdd(currentSlide);
        }

        this.dataLoader.savePersonalList();
        this.favoriteButtonUpdatedEvent.notify();
    }

    isCurrentSlideFaved()
    {
        let currentSlide = this.getCurrentSlide();

        if (currentSlide == null)
            return false;

        return this.personalList.contains(currentSlide);
    }

    toggleTags()
    {
        this.view.toggleTags();
    }
}