// Loads the extension's classic (non-module) scripts into a jsdom window, in the same order
// slideshow.html does, so tests exercise the real code.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', 'BooruSlideshow');

const SCRIPTS = [
	'js/globals.js',
	'js/functions.js',
	'js/objects/web_requester.js',
	'js/objects/site_manager.js',
	'js/objects/site_managers/site_manager_danbooru.js',
	'js/objects/site_managers/site_manager_derpibooru.js',
	'js/objects/site_managers/site_manager_e621.js',
	'js/objects/site_managers/site_manager_gelbooru.js',
	'js/objects/site_managers/site_manager_konachan.js',
	'js/objects/site_managers/site_manager_rule34.js',
	'js/objects/site_managers/site_manager_safebooru.js',
	'js/objects/site_managers/site_manager_xbooru.js',
	'js/objects/site_managers/site_manager_yandere.js',
	'js/objects/site_manager_factory.js',
	'js/objects/sites_manager.js',
	'js/objects/slide.js',
	'js/objects/personal_list_item.js',
	'js/objects/personal_list.js',
	'js/objects/event.js',
	'js/objects/data_loader.js',
	'js/mvc/slideshow_model.js',
	'js/mvc/slideshow_view.js'
];

const EXPORTS = `
window.__t = {
	SITE_RULE34, SITE_GELBOORU, SITE_SAFEBOORU, SITE_DANBOORU, SITE_E621,
	MEDIA_TYPE_IMAGE, MEDIA_TYPE_VIDEO, MEDIA_TYPE_GIF, MEDIA_TYPE_UNSUPPORTED,
	SiteManager, SiteManagerRule34, SiteManagerGelbooru, SiteManagerSafebooru, SiteManagerFactory,
	Slide, DataLoader, SlideshowModel, SlideshowView, SitesManager,
	sanitizeHttpsUrl, redactUrl, buildDownloadFilename, CREDENTIAL_STORAGE_KEYS
};`;

function loadApp(options = {})
{
	const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'moz-extension://test/slideshow.html' });
	const win = dom.window;

	win.chrome = options.chrome || { runtime: {}, storage: { sync: {}, local: {} } };
	if (options.Image) win.Image = options.Image;

	const code = SCRIPTS.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n') + EXPORTS;
	win.eval(code);

	return { window: win, ...win.__t };
}

// Minimal stand-in for SitesManager/model so a SiteManager can be built in isolation.
function fakeSitesManager(modelOverrides = {})
{
	const warnings = [];
	const model = Object.assign({
		includeImages: true, includeGifs: true, includeWebms: true,
		includeExplicit: true, includeQuestionable: true, includeSafe: true,
		blacklist: '',
		rule34UserId: '', rule34ApiKey: '',
		gelbUserId: '', gelbApiKey: '',
		areSomeTagsAreBlacklisted(tags) {
			const bl = new Set(this.blacklist.split(/\s+/).filter(Boolean));
			return tags.split(/\s+/).some(t => bl.has(t));
		}
	}, modelOverrides);

	return { model, warnings, displayWarningMessage(m) { warnings.push(m); } };
}

module.exports = { loadApp, fakeSitesManager, ROOT };
