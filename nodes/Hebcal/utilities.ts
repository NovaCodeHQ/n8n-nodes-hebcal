import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { requiredInteger, requiredString } from './dateUtils';
import { loadHebcalCore, loadHebcalHdate } from './library';
import { serializeLocation } from './locations';
import { HEBREW_LOCALES } from './locales';

export const utilitiesOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['utility'] } },
	options: [
		{
			name: 'Gematriya Converter',
			value: 'gematriya',
			description: 'Convert between numbers and Hebrew-letter numerals',
			action: 'Convert gematriya',
		},
		{
			name: 'Hebrew Nikud Stripper',
			value: 'stripNikud',
			description: 'Remove vowel points from Hebrew text',
			action: 'Strip nikud',
		},
		{
			name: 'Holiday Names',
			value: 'holidayNames',
			description: 'Built-in transliterated holiday names used in titles',
			action: 'List holiday names',
		},
		{
			name: 'Legacy Timezone Converter',
			value: 'legacyTimezone',
			description: 'Convert a legacy GMT offset and DST region to an IANA timezone',
			action: 'Convert a legacy timezone',
		},
		{
			name: 'List Locales',
			value: 'locales',
			description: 'Every installed translation locale',
			action: 'List locales',
		},
		{
			name: 'Location Lookup',
			value: 'locationLookup',
			description: 'Look up a classic Hebcal city by name',
			action: 'Look up a location',
		},
		{
			name: 'Number Ordinal',
			value: 'ordinal',
			description: 'Render a number as a locale-aware ordinal',
			action: 'Format an ordinal',
		},
		{
			name: 'Reformat Time',
			value: 'reformatTime',
			description: 'Format a 24-hour time string for a locale',
			action: 'Reformat a time',
		},
		{
			name: 'Text Translation',
			value: 'translate',
			description: 'Translate a Hebcal message identifier into a locale',
			action: 'Translate text',
		},
		{
			name: 'USA Timezone Converter',
			value: 'usaTimezone',
			description: 'Convert US state and zone info to an IANA timezone',
			action: 'Convert a USA timezone',
		},
	],
	default: 'locationLookup',
};

const showFor = (operations: string[]) => ({
	show: { resource: ['utility'], operation: operations },
});

export const utilitiesFields: INodeProperties[] = [
	{
		displayName: 'City Name',
		name: 'cityName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Paris',
		description: 'Classic city name; lookup is case-insensitive',
		displayOptions: showFor(['locationLookup']),
	},
	{
		displayName: 'GMT Offset Hours',
		name: 'gmtOffset',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 2,
		displayOptions: showFor(['legacyTimezone']),
	},
	{
		displayName: 'DST Region',
		name: 'dstRegion',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'European', value: 'eu' },
			{ name: 'Israel', value: 'israel' },
			{ name: 'None', value: 'none' },
			{ name: 'USA', value: 'usa' },
		],
		default: 'none',
		displayOptions: showFor(['legacyTimezone']),
	},
	{
		displayName: 'State',
		name: 'usState',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'AZ',
		description: 'Two-letter all-caps US state abbreviation',
		displayOptions: showFor(['usaTimezone']),
	},
	{
		displayName: 'Zone Number',
		name: 'usZone',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 7,
		description: 'Positive number where 5 is America/New_York and 8 is America/Los_Angeles',
		displayOptions: showFor(['usaTimezone']),
	},
	{
		displayName: 'Observes DST',
		name: 'usDst',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'No', value: 'N' },
			{ name: 'Yes', value: 'Y' },
		],
		default: 'Y',
		displayOptions: showFor(['usaTimezone']),
	},
	{
		displayName: 'Direction',
		name: 'gematriyaDirection',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'To Hebrew Numerals', value: 'encode' },
			{ name: 'To Number', value: 'decode' },
		],
		default: 'encode',
		displayOptions: showFor(['gematriya']),
	},
	{
		displayName: 'Value',
		name: 'gematriyaValue',
		type: 'string',
		required: true,
		default: '',
		placeholder: '25',
		description: 'A number to encode, or Hebrew letters to decode',
		displayOptions: showFor(['gematriya']),
	},
	{
		displayName: 'Hebrew Text',
		name: 'hebrewText',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'אֱלוּל',
		displayOptions: showFor(['stripNikud']),
	},
	{
		displayName: 'Number',
		name: 'ordinalNumber',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 15,
		displayOptions: showFor(['ordinal']),
	},
	{
		displayName: 'Time',
		name: 'timeString',
		type: 'string',
		required: true,
		default: '',
		placeholder: '20:30',
		description: '24-hour time string from 00:00 to 23:59',
		displayOptions: showFor(['reformatTime']),
	},
	{
		displayName: 'Suffix',
		name: 'timeSuffix',
		type: 'string',
		default: 'pm',
		description: 'Appended in 12-hour mode, for example p, pm, or P.M',
		displayOptions: showFor(['reformatTime']),
	},
	{
		displayName: 'Time Format',
		name: 'timeFormat',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: '12-Hour Clock', value: 'twelve' },
			{ name: '24-Hour Clock', value: 'twentyFour' },
			{ name: 'Locale Default', value: 'default' },
		],
		default: 'default',
		displayOptions: showFor(['reformatTime']),
	},
	{
		displayName: 'Text',
		name: 'textId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Shabbat',
		description: 'Hebcal message identifier such as a month or holiday name',
		displayOptions: showFor(['translate']),
	},
	{
		displayName: 'Locale',
		name: 'locale',
		type: 'options',
		options: HEBREW_LOCALES,
		default: 'en',
		displayOptions: showFor(['ordinal', 'reformatTime', 'translate']),
	},
];

export async function executeUtilities(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const core = await loadHebcalCore();

	switch (operation) {
		case 'locationLookup': {
			const city = requiredString(ctx.getNodeParameter('cityName', itemIndex), 'City name');
			const location = core.Location.lookup(city);
			return [
				{
					city,
					found: location !== undefined,
					location: location ? serializeLocation(location) : null,
				},
			];
		}
		case 'legacyTimezone': {
			const offset = requiredInteger(ctx.getNodeParameter('gmtOffset', itemIndex), 'GMT offset');
			const dst = ctx.getNodeParameter('dstRegion', itemIndex) as string;
			if (!['none', 'eu', 'usa', 'israel'].includes(dst)) {
				throw new RangeError(`Unsupported DST region: ${dst}`);
			}
			return [{ offset, dst, timezone: core.Location.legacyTzToTzid(offset, dst) ?? null }];
		}
		case 'usaTimezone': {
			const state = requiredString(ctx.getNodeParameter('usState', itemIndex), 'State');
			const zone = requiredInteger(ctx.getNodeParameter('usZone', itemIndex), 'Zone number');
			const dst = ctx.getNodeParameter('usDst', itemIndex) as string;
			if (dst !== 'Y' && dst !== 'N') throw new RangeError(`Unsupported DST value: ${dst}`);
			return [{ state, zone, dst, timezone: core.Location.getUsaTzid(state, zone, dst) }];
		}
		case 'gematriya': {
			const hdate = await loadHebcalHdate();
			const direction = ctx.getNodeParameter('gematriyaDirection', itemIndex) as string;
			const value = requiredString(ctx.getNodeParameter('gematriyaValue', itemIndex), 'Value');
			if (direction === 'encode') {
				return [{ direction, value, result: hdate.gematriya(value) }];
			}
			if (direction === 'decode') {
				return [{ direction, value, result: hdate.gematriyaStrToNum(value) }];
			}
			throw new RangeError(`Unsupported direction: ${direction}`);
		}
		case 'stripNikud': {
			const text = requiredString(ctx.getNodeParameter('hebrewText', itemIndex), 'Hebrew text');
			return [{ input: text, output: core.Locale.hebrewStripNikkud(text) }];
		}
		case 'ordinal': {
			const number = requiredInteger(ctx.getNodeParameter('ordinalNumber', itemIndex), 'Number');
			const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';
			return [{ number, locale, ordinal: core.Locale.ordinal(number, locale) }];
		}
		case 'reformatTime': {
			const timeString = requiredString(ctx.getNodeParameter('timeString', itemIndex), 'Time');
			if (!/^\d{1,2}:\d{2}$/.test(timeString)) {
				throw new RangeError('Time must use 24-hour HH:MM format');
			}
			const suffix = (ctx.getNodeParameter('timeSuffix', itemIndex) as string) ?? '';
			const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';
			const timeFormat = ctx.getNodeParameter('timeFormat', itemIndex) as string;
			let hour12: boolean | undefined;
			if (timeFormat === 'twelve') hour12 = true;
			else if (timeFormat === 'twentyFour') hour12 = false;
			else if (timeFormat !== 'default')
				throw new RangeError(`Unsupported time format: ${timeFormat}`);
			return [
				{
					time: timeString,
					suffix,
					locale,
					formatted: core.reformatTimeStr(timeString, suffix, { locale, hour12 }),
				},
			];
		}
		case 'translate': {
			const text = requiredString(ctx.getNodeParameter('textId', itemIndex), 'Text');
			const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';
			return [
				{
					text,
					locale,
					translation: core.Locale.gettext(text, locale),
					exact: core.Locale.lookupTranslation(text, locale) ?? null,
				},
			];
		}
		case 'locales': {
			return core.Locale.getLocaleNames().map((locale) => ({
				locale,
				hebrew: core.Locale.isHebrewLocale(locale),
			}));
		}
		case 'holidayNames': {
			return Object.entries(core.holidayDesc).map(([key, name]) => ({ key, name }));
		}
		default:
			throw new RangeError(`Unsupported Utilities operation: ${operation}`);
	}
}
