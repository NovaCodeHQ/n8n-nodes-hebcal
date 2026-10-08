import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import {
	dateInputProperties,
	getDateParameter,
	requiredInteger,
	serializeHebrewDate,
} from './dateUtils';
import { loadHebcalCore } from './library';
import { locationProperties, resolveLocation, serializeLocation } from './locations';
import {
	dateToIsoString,
	noonInTimezone,
	parseOptionalInstant,
	parseZonedInstant,
	plainDateFor,
	temporalToString,
} from './timeUtils';

const ZMANIM_OPERATIONS = [
	'day',
	'custom',
	'temporalHour',
	'lunar',
	'astronomy',
	'format',
] as const;

export const zmanimOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['zmanim'] } },
	options: [
		{
			name: 'Astronomy',
			value: 'astronomy',
			description: 'Twilight, solar position, transit, and temporal hours from NOAA data',
			action: 'Calculate astronomy times',
		},
		{
			name: 'Custom Calculation',
			value: 'custom',
			description: 'Time at an angle or sunrise/sunset offset in minutes',
			action: 'Calculate a custom time',
		},
		{
			name: 'Daily Times',
			value: 'day',
			description: 'All standard halachic times for one day and location',
			action: 'Calculate daily times',
		},
		{
			name: 'Format Instant',
			value: 'format',
			description: 'Format an instant and derive its sunset-aware Hebrew date',
			action: 'Format an instant',
		},
		{
			name: 'Lunar Times',
			value: 'lunar',
			description: 'Molad moment and Kiddush Levana windows for the date',
			action: 'Calculate lunar times',
		},
		{
			name: 'Temporal Hour',
			value: 'temporalHour',
			description: 'Proportional-hour start and length in milliseconds',
			action: 'Calculate a temporal hour',
		},
	],
	default: 'day',
};

const showFor = (operations: string[]) => ({
	show: { resource: ['zmanim'], operation: operations },
});
const ALL_OPS = [...ZMANIM_OPERATIONS];

export const zmanimFields: INodeProperties[] = [
	...dateInputProperties('date', 'zmanim', ALL_OPS),
	...locationProperties('location', 'zmanim', ALL_OPS, 'custom'),
	{
		displayName: 'Use Elevation',
		name: 'useElevation',
		type: 'boolean',
		default: false,
		description: 'Whether to factor the location elevation into sunrise/sunset-based times',
		displayOptions: showFor(ALL_OPS),
	},
	{
		displayName: 'Tzeit Angle',
		name: 'tzeitAngle',
		type: 'number',
		default: 8.5,
		description: 'Solar depression degrees for nightfall (8.5 by default, 7.083 is common)',
		displayOptions: showFor(['day']),
	},
	{
		displayName: 'Calculation',
		name: 'calculation',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Sunrise Offset', value: 'sunriseOffset' },
			{ name: 'Sunset Offset', value: 'sunsetOffset' },
			{ name: 'Time at Angle', value: 'timeAtAngle' },
		],
		default: 'timeAtAngle',
		displayOptions: showFor(['custom']),
	},
	{
		displayName: 'Angle (Degrees)',
		name: 'angle',
		type: 'number',
		required: true,
		default: 8.5,
		description: 'Solar depression degrees below the horizon',
		displayOptions: showFor(['custom', 'temporalHour']),
	},
	{
		displayName: 'Rising (Morning)',
		name: 'rising',
		type: 'boolean',
		default: false,
		description: 'Whether the morning occurrence applies instead of the evening one',
		displayOptions: {
			show: { resource: ['zmanim'], operation: ['custom'], calculation: ['timeAtAngle'] },
		},
	},
	{
		displayName: 'Offset Minutes',
		name: 'offsetMinutes',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: -18,
		description: 'Minutes added to sunrise or sunset; negative values go earlier',
		displayOptions: {
			show: {
				resource: ['zmanim'],
				operation: ['custom'],
				calculation: ['sunriseOffset', 'sunsetOffset'],
			},
		},
	},
	{
		displayName: 'Offset Minutes',
		name: 'astronomyOffsetMinutes',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		default: 0,
		description: 'Minutes added to sunrise for the offset sample; negative values go earlier',
		displayOptions: showFor(['astronomy']),
	},
	{
		displayName: 'Round to Minute',
		name: 'roundMinute',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['zmanim'],
				operation: ['custom'],
				calculation: ['sunriseOffset', 'sunsetOffset'],
			},
		},
	},
	{
		displayName: 'Force Sea Level',
		name: 'forceSeaLevel',
		type: 'boolean',
		default: false,
		description: 'Whether to ignore elevation even when enabled above',
		displayOptions: {
			show: {
				resource: ['zmanim'],
				operation: ['custom'],
				calculation: ['sunriseOffset', 'sunsetOffset'],
			},
		},
	},
	{
		displayName: 'Hour Method',
		name: 'hourMethod',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'By Solar Degrees', value: 'byDegrees' },
			{ name: 'Fixed 72 Minutes', value: 'fixed72' },
		],
		default: 'fixed72',
		displayOptions: showFor(['temporalHour']),
	},
	{
		displayName: 'Force Sea Level',
		name: 'temporalSeaLevel',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: { resource: ['zmanim'], operation: ['temporalHour'], hourMethod: ['fixed72'] },
		},
	},
	{
		displayName: 'Alos Reference',
		name: 'alosReference',
		type: 'string',
		default: '',
		placeholder: '2024-04-08T04:00:00-04:00[America/New_York]',
		description: 'Optional ISO instant used to adjust daytime lunar boundaries',
		displayOptions: showFor(['lunar']),
	},
	{
		displayName: 'Tzais Reference',
		name: 'tzaisReference',
		type: 'string',
		default: '',
		placeholder: '2024-04-08T20:00:00-04:00[America/New_York]',
		description: 'Optional ISO instant used to adjust daytime lunar boundaries',
		displayOptions: showFor(['lunar']),
	},
	{
		displayName: 'Instant',
		name: 'instant',
		type: 'string',
		default: '',
		placeholder: '2024-03-08T12:00:00-05:00[America/New_York]',
		description: 'ISO instant for solar position; empty means local noon on the date',
		displayOptions: showFor(['astronomy']),
	},
	{
		displayName: 'Instant',
		name: 'formatInstant',
		type: 'string',
		required: true,
		default: '',
		placeholder: '2024-03-08T18:49:00-05:00[America/New_York]',
		description: 'ISO instant to format',
		displayOptions: showFor(['format']),
	},
	{
		displayName: 'Time Format',
		name: 'timeFormat',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: '12-Hour Clock', value: 'twelve' },
			{ name: '24-Hour Clock', value: 'twentyFour' },
			{ name: 'Location Default', value: 'default' },
		],
		default: 'default',
		displayOptions: showFor(['format']),
	},
];

const DAY_TIMES = [
	'sunrise',
	'seaLevelSunrise',
	'neitzHaChama',
	'sunset',
	'seaLevelSunset',
	'shkiah',
	'dawn',
	'dusk',
	'gregEve',
	'chatzot',
	'chatzotNight',
	'alotHaShachar',
	'alotHaShachar72',
	'misheyakir',
	'misheyakirMachmir',
	'sofZmanShma',
	'sofZmanTfilla',
	'sofZmanBiurChametzGRA',
	'sofZmanShmaMGA',
	'sofZmanShmaMGA16Point1',
	'sofZmanShmaMGA19Point8',
	'sofZmanTfillaMGA',
	'sofZmanTfillaMGA16Point1',
	'sofZmanTfillaMGA19Point8',
	'minchaGedola',
	'minchaGedolaMGA',
	'minchaKetana',
	'minchaKetanaMGA',
	'plagHaMincha',
	'beinHaShmashos',
	'alosBaalHatanya',
	'sofZmanShmaBaalHatanya',
	'sofZmanTfilaBaalHatanya',
	'minchaGedolaBaalHatanya',
	'minchaKetanaBaalHatanya',
	'plagHaminchaBaalHatanya',
	'tzaisBaalHatanya',
] as const;

type ZmanimInstance = {
	[method in (typeof DAY_TIMES)[number]]: () => Date;
} & {
	tzeit: (angle?: number) => Date;
	alotHaShachar72zdt: () => unknown;
	tzeit72: () => unknown;
	getZmanMolad: () => unknown;
	nightHour: () => number;
	getTemporalHour72: (forceSeaLevel: boolean) => [Date, number];
	getTemporalHourByDeg: (angle: number) => [Date, number];
	timeAtAngle: (angle: number, rising: boolean) => Date;
	sunriseOffset: (offset: number, roundMinute?: boolean, forceSeaLevel?: boolean) => Date;
	sunsetOffset: (offset: number, roundMinute?: boolean, forceSeaLevel?: boolean) => Date;
	getSofZmanKidushLevanaBetweenMoldos: (alos?: unknown, tzais?: unknown) => unknown;
	getSofZmanKidushLevana15Days: (alos?: unknown, tzais?: unknown) => unknown;
	getTchilasZmanKidushLevana3Days: (alos?: unknown, tzais?: unknown) => unknown;
	getTchilasZmanKidushLevana7Days: (alos?: unknown, tzais?: unknown) => unknown;
};

async function buildZmanim(ctx: IExecuteFunctions, itemIndex: number) {
	const core = await loadHebcalCore();
	const date = await getDateParameter(ctx, itemIndex, 'date');
	const location = await resolveLocation(ctx, itemIndex, 'location');
	if (!location) throw new RangeError('A location is required for Zmanim calculations');
	const useElevation = ctx.getNodeParameter('useElevation', itemIndex) as boolean;
	const zmanim = new core.Zmanim(location, date, useElevation);
	// SAFETY: ZmanimInstance declares the subset of Zmanim methods this module calls,
	// verified against zmanim.d.ts of the locked @hebcal/core 6.13.1 release.
	return { core, date, location, useElevation, zmanim: zmanim as unknown as ZmanimInstance };
}

export async function executeZmanim(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const { core, date, location, useElevation, zmanim } = await buildZmanim(ctx, itemIndex);

	switch (operation) {
		case 'day': {
			const tzeitAngle = ctx.getNodeParameter('tzeitAngle', itemIndex) as number;
			if (!Number.isFinite(tzeitAngle) || tzeitAngle <= 0) {
				throw new RangeError('Tzeit angle must be a positive number');
			}
			const times: IDataObject = {};
			for (const method of DAY_TIMES) {
				times[method] = dateToIsoString(zmanim[method]());
			}
			times.tzeit = dateToIsoString(zmanim.tzeit(tzeitAngle));
			return [
				{
					date: serializeHebrewDate(date),
					location: serializeLocation(location),
					times,
					temporal: {
						alotHaShachar72: temporalToString(zmanim.alotHaShachar72zdt()),
						tzeit72: temporalToString(zmanim.tzeit72()),
						moladMoment: temporalToString(zmanim.getZmanMolad()),
					},
					nightHourMs: zmanim.nightHour(),
				},
			];
		}
		case 'custom': {
			const calculation = ctx.getNodeParameter('calculation', itemIndex) as string;
			if (calculation === 'timeAtAngle') {
				const angle = ctx.getNodeParameter('angle', itemIndex) as number;
				const rising = ctx.getNodeParameter('rising', itemIndex) as boolean;
				if (!Number.isFinite(angle) || angle <= 0) {
					throw new RangeError('Angle must be a positive number');
				}
				return [
					{
						calculation,
						angle,
						rising,
						result: dateToIsoString(zmanim.timeAtAngle(angle, rising)),
					},
				];
			}
			if (calculation === 'sunriseOffset' || calculation === 'sunsetOffset') {
				const offset = requiredInteger(
					ctx.getNodeParameter('offsetMinutes', itemIndex),
					'Offset minutes',
				);
				const roundMinute = ctx.getNodeParameter('roundMinute', itemIndex) as boolean;
				const forceSeaLevel = ctx.getNodeParameter('forceSeaLevel', itemIndex) as boolean;
				return [
					{
						calculation,
						offsetMinutes: offset,
						result: dateToIsoString(zmanim[calculation](offset, roundMinute, forceSeaLevel)),
					},
				];
			}
			throw new RangeError(`Unsupported calculation: ${calculation}`);
		}
		case 'temporalHour': {
			const method = ctx.getNodeParameter('hourMethod', itemIndex) as string;
			if (method === 'fixed72') {
				const forceSeaLevel = ctx.getNodeParameter('temporalSeaLevel', itemIndex) as boolean;
				const [start, hourMs] = zmanim.getTemporalHour72(forceSeaLevel);
				return [{ method, start: dateToIsoString(start), hourMs }];
			}
			if (method === 'byDegrees') {
				const angle = ctx.getNodeParameter('angle', itemIndex) as number;
				if (!Number.isFinite(angle) || angle <= 0) {
					throw new RangeError('Angle must be a positive number');
				}
				const [start, hourMs] = zmanim.getTemporalHourByDeg(angle);
				return [{ method, angle, start: dateToIsoString(start), hourMs }];
			}
			throw new RangeError(`Unsupported hour method: ${method}`);
		}
		case 'lunar': {
			const alos = parseOptionalInstant(
				ctx.getNodeParameter('alosReference', itemIndex),
				'Alos reference',
			);
			const tzais = parseOptionalInstant(
				ctx.getNodeParameter('tzaisReference', itemIndex),
				'Tzais reference',
			);
			return [
				{
					moladMoment: temporalToString(zmanim.getZmanMolad()),
					tchilas3Days: temporalToString(zmanim.getTchilasZmanKidushLevana3Days(alos, tzais)),
					tchilas7Days: temporalToString(zmanim.getTchilasZmanKidushLevana7Days(alos, tzais)),
					sofBetweenMoldos: temporalToString(
						zmanim.getSofZmanKidushLevanaBetweenMoldos(alos, tzais),
					),
					sof15Days: temporalToString(zmanim.getSofZmanKidushLevana15Days(alos, tzais)),
				},
			];
		}
		case 'astronomy': {
			const { NOAACalculator, GeoLocation } = core;
			const geo = new GeoLocation(
				null,
				location.getLatitude(),
				location.getLongitude(),
				location.getElevation(),
				location.getTzid(),
			);
			const noaa = new NOAACalculator(geo, plainDateFor(date));
			const instant =
				parseOptionalInstant(ctx.getNodeParameter('instant', itemIndex), 'Instant') ??
				noonInTimezone(date, location.getTzid());
			// The NOAA solar-position routines read the wall-clock hour as UTC.
			const utcInstant = instant.withTimeZone('UTC');
			const offsetMinutes = requiredInteger(
				ctx.getNodeParameter('astronomyOffsetMinutes', itemIndex),
				'Offset minutes',
			);
			return [
				{
					date: serializeHebrewDate(date),
					location: serializeLocation(location),
					sunrise: temporalToString(noaa.getSunrise()),
					seaLevelSunrise: temporalToString(noaa.getSeaLevelSunrise()),
					sunset: temporalToString(noaa.getSunset()),
					seaLevelSunset: temporalToString(noaa.getSeaLevelSunset()),
					twilight: {
						civilDawn: temporalToString(noaa.getBeginCivilTwilight()),
						nauticalDawn: temporalToString(noaa.getBeginNauticalTwilight()),
						astronomicalDawn: temporalToString(noaa.getBeginAstronomicalTwilight()),
						civilDusk: temporalToString(noaa.getEndCivilTwilight()),
						nauticalDusk: temporalToString(noaa.getEndNauticalTwilight()),
						astronomicalDusk: temporalToString(noaa.getEndAstronomicalTwilight()),
					},
					sunriseByDegrees: temporalToString(noaa.getSunriseOffsetByDegrees(90.833)),
					sunsetByDegrees: temporalToString(noaa.getSunsetOffsetByDegrees(90.833)),
					transit: temporalToString(noaa.getSunTransit()),
					temporalHourMs: noaa.getTemporalHour(),
					offsetApplied: {
						minutes: offsetMinutes,
						time: temporalToString(NOAACalculator.getTimeOffset(noaa.getSunrise(), offsetMinutes)),
					},
					solarPosition: {
						at: instant.toString(),
						elevation: NOAACalculator.getSolarElevation(
							utcInstant,
							location.getLatitude(),
							location.getLongitude(),
						),
						azimuth: NOAACalculator.getSolarAzimuth(
							utcInstant,
							location.getLatitude(),
							location.getLongitude(),
						),
					},
				},
			];
		}
		case 'format': {
			const { Zmanim } = core;
			const instant = parseZonedInstant(
				ctx.getNodeParameter('formatInstant', itemIndex),
				'Instant',
			);
			const timeFormat = ctx.getNodeParameter('timeFormat', itemIndex) as string;
			const dateValue = new Date(instant.epochMilliseconds);
			let formatter: Intl.DateTimeFormat;
			if (timeFormat === 'twelve') {
				formatter = new Intl.DateTimeFormat('en-US', {
					timeZone: location.getTzid(),
					hour: 'numeric',
					minute: '2-digit',
					hour12: true,
				});
			} else if (timeFormat === 'twentyFour') {
				formatter = new Intl.DateTimeFormat('en-US', {
					timeZone: location.getTzid(),
					hour: '2-digit',
					minute: '2-digit',
					hour12: false,
				});
			} else if (timeFormat === 'default') {
				formatter = location.getTimeFormatter();
			} else {
				throw new RangeError(`Unsupported time format: ${timeFormat}`);
			}
			return [
				{
					instant: instant.toString(),
					isoWithTimezone: Zmanim.formatISOWithTimeZone(location.getTzid(), dateValue),
					local: formatter.format(dateValue),
					rounded: dateToIsoString(Zmanim.roundTime(dateValue)),
					timezoneOffset: Zmanim.timeZoneOffset(location.getTzid(), dateValue),
					sunsetAwareDate: serializeHebrewDate(
						Zmanim.makeSunsetAwareHDate(location, dateValue, useElevation),
					),
				},
			];
		}
		default:
			throw new RangeError(`Unsupported Zmanim operation: ${operation}`);
	}
}
