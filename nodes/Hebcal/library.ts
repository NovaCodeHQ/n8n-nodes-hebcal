import type { HDate } from '@hebcal/core' with { 'resolution-mode': 'import' };
import type { ZipEntry } from 'zipcodes/lib/codes.js' with { 'resolution-mode': 'import' };
import type tzLookup from 'tz-lookup' with { 'resolution-mode': 'import' };

export type HebcalCore = typeof import('@hebcal/core', { with: { 'resolution-mode': 'import' } });
export type HebcalHdate = typeof import('@hebcal/hdate', { with: { 'resolution-mode': 'import' } });
export type HebcalLeyning = typeof import('@hebcal/leyning', {
	with: { 'resolution-mode': 'import' }
});
export type HebcalTriennial = typeof import('@hebcal/triennial', {
	with: { 'resolution-mode': 'import' }
});
export type HebrewDate = HDate;

let packagesPromise: Promise<HebcalCore> | undefined;
let hdatePromise: Promise<HebcalHdate> | undefined;

/**
 * Load the Hebcal core module with all companion packages registered.
 * The learning, leyning, triennial, and locales packages register their
 * schedules and translations as a side effect of being imported, so they
 * must be loaded alongside core (and bundled with it).
 */
export function loadHebcalCore(): Promise<HebcalCore> {
	packagesPromise ??= (async () => {
		const [core] = await Promise.all([
			import('@hebcal/core'),
			import('@hebcal/hdate'),
			import('@hebcal/learning'),
			import('@hebcal/leyning'),
			import('@hebcal/triennial'),
			import('@hebcal/locales'),
		]);
		return core;
	})();
	return packagesPromise;
}

export function loadHebcalHdate(): Promise<HebcalHdate> {
	hdatePromise ??= import('@hebcal/hdate');
	return hdatePromise;
}

let leyningPromise: Promise<HebcalLeyning> | undefined;
let triennialPromise: Promise<HebcalTriennial> | undefined;

export function loadHebcalLeyning(): Promise<HebcalLeyning> {
	leyningPromise ??= import('@hebcal/leyning');
	return leyningPromise;
}

export function loadHebcalTriennial(): Promise<HebcalTriennial> {
	triennialPromise ??= import('@hebcal/triennial');
	return triennialPromise;
}

export interface GeoData {
	codes: Record<string, ZipEntry>;
	tzLookup: typeof tzLookup;
}

let geoPromise: Promise<GeoData> | undefined;

/**
 * Load the offline geography data: the US ZIP code database and the
 * coordinate-to-timezone lookup. Both are bundled, so resolution needs
 * no network access.
 */
export function loadGeoData(): Promise<GeoData> {
	geoPromise ??= (async () => {
		const [{ codes }, tzModule] = await Promise.all([
			import('zipcodes/lib/codes.js'),
			import('tz-lookup'),
		]);
		// SAFETY: tz-lookup is a UMD module; under bundlers it surfaces as .default,
		// under require() as the bare export. Both shapes are handled below.
		const interop = tzModule as unknown as { default?: typeof tzLookup };
		// SAFETY: same UMD interop as above; falls back to the bare export shape.
		const tzLookupFn = interop.default ?? (tzModule as unknown as typeof tzLookup);
		if (typeof tzLookupFn !== 'function') throw new RangeError('Timezone lookup failed to load');
		return { codes, tzLookup: tzLookupFn };
	})();
	return geoPromise;
}
