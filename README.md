# BooruSlideshow
## Firefox only
## Not permitted on the Google Chrome store.

A Firefox extension for a slideshow of boorus.

Download from Firefox Browser Add-Ons
https://addons.mozilla.org/en-US/firefox/addon/booru-slideshow-official/

Download as a ZIP file
https://github.com/Chirmaya/BooruSlideshow/raw/master/BooruSlideshow.zip




## rule34.xxx
rule34.xxx's API requires an account. Log in at rule34.xxx, open *My Account > Options*, copy your API key and user ID, and enter them under **Sites** next to rule34.xxx. They are stored only in this browser's local extension storage (not synced).

## booru.allthefallen.moe
Requires your ATFBooru username and an API key (create one in your account settings on the site). Enter both under **Sites**; they are kept in local extension storage only. The site has an anti-bot check: if you see a message about it, open https://booru.allthefallen.moe in Firefox, let the check finish, and retry. Whether the check lets extension requests through could not be verified without a live session.

## Install for local testing (Firefox 113+)
1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...** and pick `BooruSlideshow/manifest.json` (or a built zip from `dist/`).
3. Open `about:addons` > Booru Slideshow > **Permissions** and make sure the site access permissions are granted (Firefox MV3 does not always grant host permissions automatically).
4. Click the toolbar icon to open the slideshow.

Temporary add-ons are removed when Firefox restarts. For a permanent install, use the signed build from addons.mozilla.org, or Firefox Developer Edition / Nightly / ESR with `xpinstall.signatures.required` set to `false` for an unsigned zip.

## Development
    npm install
    npm test        # unit tests (node:test + jsdom)
    npm run lint    # web-ext lint
    npm run build   # dist/booru_slideshow-<version>.zip
    npm run run:firefox
