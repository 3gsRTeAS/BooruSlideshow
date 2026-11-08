class SiteManagerFactory
{
    static createSiteManager(sitesManager, id, pageLimit)
    {
        switch (id)
		{
			case SITE_ATFBOORU:
				return new SiteManagerAtfBooru(sitesManager, pageLimit);
			case SITE_GELBOORU:
				return new SiteManagerGelbooru(sitesManager, pageLimit);
			case SITE_RULE34:
				return new SiteManagerRule34(sitesManager, pageLimit);
			case SITE_RULE34HENTAI:
				return new SiteManagerRule34Hentai(sitesManager, pageLimit);
			default:
                console.log('SiteManagerFactory cannot handle the supplied site ID: ' + id);
                return;
		}
    }
}