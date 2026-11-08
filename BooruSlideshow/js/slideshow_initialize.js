let slideshowController = null;

document.addEventListener('DOMContentLoaded', function () {
    slideshowController = new SlideshowController({
        'warningMessage': document.getElementById('warning-message'),
        'infoMessage': document.getElementById('info-message'),
        'currentImage': document.getElementById('current-image'),
        'currentVideo': document.getElementById('current-video'),
        'currentVideoSourceWebm': document.getElementById('current-video-source-webm'),
        'loadingAnimation': document.getElementById('loading-animation'),
        'navigation': document.getElementById('navigation'),
        'currentSlideNumber': document.getElementById('current-slide-number'),
        'totalSlideNumber': document.getElementById('total-slide-number'),
        'thumbnailList': document.getElementById('thumbnail-list'),
        'searchTextBox': document.getElementById('search-text'),
        'searchButton': document.getElementById('search-button'),
        'firstNavButton': document.getElementById('first-button'),
        'previousNavButton': document.getElementById('previous-button'),
        'nextNavButton': document.getElementById('next-button'),
        'lastNavButton': document.getElementById('last-button'),
        'playButton': document.getElementById('play-button'),
        'pauseButton': document.getElementById('pause-button'),
        'sitesToSearch': document.getElementsByName('sites-to-search'),
        'secondsPerSlideTextBox': document.getElementById('seconds-per-slide'),
        'maxWidthTextBox': document.getElementById('max-width'),
        'maxHeightTextBox': document.getElementById('max-height'),
        'autoFitSlideCheckBox': document.getElementById('auto-fit-slide'),
        'includeImagesCheckBox': document.getElementById('include-images'),
        'includeGifsCheckBox': document.getElementById('include-gifs'),
        'includeWebmsCheckBox': document.getElementById('include-webms'),
        'includeExplicitCheckBox': document.getElementById('include-explicit'),
        'includeQuestionableCheckBox': document.getElementById('include-questionable'),
        'includeSafeCheckBox': document.getElementById('include-safe'),
        'hideBlacklist': document.getElementById('hide-blacklist'),
        'blacklistContainer': document.getElementById('blacklist-container'),
        'blacklist': document.getElementById('blacklist'),
        'gelbUserIdContainer': document.getElementById('gelb-userid-container'),
        'gelbApiKeyContainer': document.getElementById('gelb-api-key-container'),
        'gelbUserId': document.getElementById('gelb-userid'),
        'gelbApiKey': document.getElementById('gelb-api-key'),
        'atfUsernameContainer': document.getElementById('atf-username-container'),
        'atfApiKeyContainer': document.getElementById('atf-api-key-container'),
        'atfUsername': document.getElementById('atf-username'),
        'atfApiKey': document.getElementById('atf-api-key'),
        'rule34UserIdContainer': document.getElementById('rule34-userid-container'),
        'rule34ApiKeyContainer': document.getElementById('rule34-api-key-container'),
        'rule34UserId': document.getElementById('rule34-userid'),
        'rule34ApiKey': document.getElementById('rule34-api-key'),
        'storeHistoryCheckBox': document.getElementById('store-history'),
        'clearHistoryButton': document.getElementById('clear-history'),
        'searchHistory': document.getElementById('search-history'),
        'favoriteButton': document.getElementById('favorite-button'),
        'tags': document.getElementById('tags'),
        'slideWrapper': document.getElementById('slide-wrapper'),
        'includeDupesCheckBox': document.getElementById('include-dupes')
    });

    (async () => {
        let result = await slideshowController.initialize();
        slideshowController.searchTextChanged();
    })();
});