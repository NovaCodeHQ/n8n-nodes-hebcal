declare module 'zipcodes/lib/codes.js' {
	export interface ZipEntry {
		zip: string;
		latitude: number;
		longitude: number;
		city: string;
		state: string;
		country: string;
	}
	const codes: Record<string, ZipEntry>;
	export { codes };
}

declare module 'tz-lookup' {
	function tzLookup(latitude: number, longitude: number): string;
	export = tzLookup;
}
