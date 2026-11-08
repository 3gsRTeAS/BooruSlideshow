function enableDevMode()
{
	LOGGING_MODE = LOGGING_MODE_DEV;
}

function disableDevMode()
{
	LOGGING_MODE = LOGGING_MODE_PROD;
}

function logForDev(text)
{
	if (LOGGING_MODE != LOGGING_MODE_DEV)
	{
		return;
	}

	console.log(text);
}

function getXmlElementStringValueSafe(xml, elementName)
{
	var elements = xml.getElementsByTagName(elementName);

	if (elements.length == 0)
	{
		return '';
	}

	return elements[0].textContent;
}

function doesXmlContainElement(xml, elementName)
{
	var elements = xml.getElementsByTagName(elementName);

	return elements.length > 0;
}

// ---------------------------------------------------------------------------
// Security helpers. Everything that comes back from a booru is untrusted.
// ---------------------------------------------------------------------------

const SENSITIVE_QUERY_PARAMS = ['api_key', 'key', 'user_id', 'login', 'password', 'token'];

/**
 * Returns a normalized absolute https:// URL string, or null if the value is
 * not a usable https URL. Protocol-relative URLs are upgraded to https.
 * Rejects javascript:, data:, blob:, plain http:, and URLs with embedded credentials.
 */
function sanitizeHttpsUrl(value, baseUrl)
{
	if (typeof value !== 'string')
		return null;

	value = value.trim();

	if (value == '')
		return null;

	if (value.substring(0, 2) == '//')
		value = 'https:' + value;

	let parsed;

	try
	{
		parsed = baseUrl ? new URL(value, baseUrl) : new URL(value);
	}
	catch (e)
	{
		return null;
	}

	if (parsed.protocol !== 'https:')
		return null;

	if (parsed.username !== '' || parsed.password !== '')
		return null;

	return parsed.href;
}

/**
 * Masks credential-bearing query parameters so a URL can be logged or shown.
 */
function redactUrl(url)
{
	if (typeof url !== 'string')
		return url;

	return url.replace(
		new RegExp('([?&](?:' + SENSITIVE_QUERY_PARAMS.join('|') + ')=)[^&#]*', 'gi'),
		'$1***');
}

/**
 * Removes anything that looks like a credential from free text (e.g. a server error message).
 */
function redactSecretsInText(text, secrets)
{
	if (typeof text !== 'string')
		return text;

	text = redactUrl(text);

	for (const secret of (secrets || []))
	{
		if (typeof secret === 'string' && secret.length >= 4)
			text = text.split(secret).join('***');
	}

	return text;
}

/**
 * Builds a safe "bs/<name>" download path from a remote URL: no query string, no path
 * separators, no "..", only conservative characters, bounded length.
 */
function buildDownloadFilename(url)
{
	var path = String(url).split(/[?#]/)[0];
	var name = path.substring(path.lastIndexOf('/') + 1);

	try
	{
		name = decodeURIComponent(name);
	}
	catch (e)
	{
		// keep the raw name
	}

	name = name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_').substring(0, 120);

	if (name == '')
		name = 'download';

	return 'bs/' + name;
}

// Node (tests) only; harmless in the browser.
if (typeof module !== 'undefined' && module.exports)
{
	module.exports = { sanitizeHttpsUrl, redactUrl, redactSecretsInText, buildDownloadFilename };
}
