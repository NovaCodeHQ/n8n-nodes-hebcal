import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { loadHebcalCore, type HebcalCore } from './library';

export type HebcalLocation = InstanceType<HebcalCore['Location']>;

export function serializeLocation(location: HebcalLocation): IDataObject {
	return {
		name: location.getName(),
		shortName: location.getShortName(),
		timezone: location.getTzid(),
		latitude: location.getLatitude(),
		longitude: location.getLongitude(),
		elevation: location.getElevation(),
		israel: location.getIsrael(),
		countryCode: location.getCountryCode() ?? null,
	};
}

export const CLASSIC_CITIES = [
	'Ashdod',
	'Atlanta',
	'Austin',
	'Baghdad',
	'Beer Sheva',
	'Berlin',
	'Baltimore',
	'Bogota',
	'Boston',
	'Budapest',
	'Buenos Aires',
	'Buffalo',
	'Chicago',
	'Cincinnati',
	'Cleveland',
	'Dallas',
	'Denver',
	'Detroit',
	'Eilat',
	'Gibraltar',
	'Haifa',
	'Hawaii',
	'Helsinki',
	'Houston',
	'Jerusalem',
	'Johannesburg',
	'Kiev',
	'La Paz',
	'Livingston',
	'Las Vegas',
	'London',
	'Los Angeles',
	'Marseilles',
	'Miami',
	'Minneapolis',
	'Melbourne',
	'Mexico City',
	'Montreal',
	'Moscow',
	'New York',
	'Omaha',
	'Ottawa',
	'Panama City',
	'Paris',
	'Pawtucket',
	'Petach Tikvah',
	'Philadelphia',
	'Phoenix',
	'Pittsburgh',
	'Providence',
	'Portland',
	'Saint Louis',
	'Saint Petersburg',
	'San Diego',
	'San Francisco',
	'Sao Paulo',
	'Seattle',
	'Sydney',
	'Tel Aviv',
	'Tiberias',
	'Toronto',
	'Vancouver',
	'White Plains',
	'Washington DC',
	'Worcester',
];

type LocationInstance = InstanceType<HebcalCore['Location']>;

export function locationProperties(
	prefix: string,
	resource: string,
	operations: string[],
	defaultMode: 'none' | 'classic' | 'custom' = 'none',
): INodeProperties[] {
	const show = { resource: [resource], operation: operations };
	return [
		{
			displayName: 'Location',
			name: `${prefix}Mode`,
			type: 'options',
			noDataExpression: true,
			options: [
				{ name: 'None', value: 'none' },
				{ name: 'Classic City', value: 'classic' },
				{ name: 'Custom Coordinates', value: 'custom' },
			],
			default: defaultMode,
			description:
				'Named cities use the built-in Hebcal list; custom locations need no external service',
			displayOptions: { show },
		},
		{
			displayName: 'City',
			name: `${prefix}City`,
			type: 'options',
			noDataExpression: true,
			options: CLASSIC_CITIES.map((city) => ({ name: city, value: city })),
			default: 'Jerusalem',
			displayOptions: { show: { ...show, [`${prefix}Mode`]: ['classic'] } },
		},
		{
			displayName: 'Latitude',
			name: `${prefix}Latitude`,
			type: 'number',
			required: true,
			default: 40.71,
			displayOptions: { show: { ...show, [`${prefix}Mode`]: ['custom'] } },
		},
		{
			displayName: 'Longitude',
			name: `${prefix}Longitude`,
			type: 'number',
			required: true,
			default: -74.0,
			displayOptions: { show: { ...show, [`${prefix}Mode`]: ['custom'] } },
		},
		{
			displayName: 'Timezone',
			name: `${prefix}Timezone`,
			type: 'string',
			required: true,
			default: 'America/New_York',
			placeholder: 'America/New_York',
			description: 'IANA timezone identifier, for example America/New_York',
			displayOptions: { show: { ...show, [`${prefix}Mode`]: ['custom'] } },
		},
		{
			displayName: 'In Israel',
			name: `${prefix}Israel`,
			type: 'boolean',
			default: false,
			description: 'Whether the custom location uses the Israeli holiday schedule',
			displayOptions: { show: { ...show, [`${prefix}Mode`]: ['custom'] } },
		},
		{
			displayName: 'Elevation (Meters)',
			name: `${prefix}Elevation`,
			type: 'number',
			default: 0,
			description: 'Only affects sunrise/sunset-based times, never degree-based times',
			displayOptions: { show: { ...show, [`${prefix}Mode`]: ['custom'] } },
		},
	];
}

export async function resolveLocation(
	ctx: Pick<IExecuteFunctions, 'getNodeParameter'>,
	itemIndex: number,
	prefix: string,
): Promise<LocationInstance | undefined> {
	const { Location } = await loadHebcalCore();
	const mode = ctx.getNodeParameter(`${prefix}Mode`, itemIndex) as string;

	if (mode === 'none') return undefined;

	if (mode === 'classic') {
		const city = ctx.getNodeParameter(`${prefix}City`, itemIndex) as string;
		const location = Location.lookup(city);
		if (!location) throw new RangeError(`Unknown classic city: ${city}`);
		return location;
	}

	if (mode === 'custom') {
		const latitude = ctx.getNodeParameter(`${prefix}Latitude`, itemIndex) as number;
		const longitude = ctx.getNodeParameter(`${prefix}Longitude`, itemIndex) as number;
		const timezone = ctx.getNodeParameter(`${prefix}Timezone`, itemIndex) as string;
		const israel = ctx.getNodeParameter(`${prefix}Israel`, itemIndex) as boolean;
		const elevation = (ctx.getNodeParameter(`${prefix}Elevation`, itemIndex) as number) ?? 0;
		if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
			throw new RangeError('Latitude must be between -90 and 90');
		}
		if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
			throw new RangeError('Longitude must be between -180 and 180');
		}
		if (!timezone?.trim()) throw new RangeError('Timezone is required');
		let validTimezone = true;
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: timezone.trim() });
		} catch {
			validTimezone = false;
		}
		if (!validTimezone) throw new RangeError(`Unknown IANA timezone: ${timezone}`);
		if (!Number.isFinite(elevation)) throw new RangeError('Elevation must be a number');
		return new Location(
			latitude,
			longitude,
			israel,
			timezone.trim(),
			undefined,
			undefined,
			undefined,
			elevation,
		);
	}

	throw new RangeError(`Unsupported location mode: ${mode}`);
}
