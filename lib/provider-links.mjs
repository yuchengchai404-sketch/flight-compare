import '../browser-helper/provider-search-core.js';
export const providerCapabilities=globalThis.flightProviderSearchCore.capabilities;
export const providerSearchUrl=(provider,query,direction)=>globalThis.flightProviderSearchCore.searchUrl(provider,query,direction);
export const inspectTongchengUrl=raw=>globalThis.flightProviderSearchCore.inspectLyUrl(raw);
export const inspectCtripUrl=raw=>globalThis.flightProviderSearchCore.inspectCtripUrl(raw);
