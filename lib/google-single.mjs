import './flight-query.mjs';
import '../browser-helper/google-search-core.js';
export const googleSingleUrl=(q,direction)=>globalThis.flightGoogleSearchCore.searchUrl(q,direction);
export const googleSingleMeta=url=>globalThis.flightGoogleSearchCore.inspect(url);

