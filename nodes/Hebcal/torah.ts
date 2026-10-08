import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import type {
	Aliyah,
	AliyotMap,
	Leyning,
	LeyningWeekday,
} from '@hebcal/leyning' with { 'resolution-mode': 'import' };
import {
	dateInputProperties,
	getDateParameter,
	requiredInteger,
	serializeHebrewDate,
} from './dateUtils';
import { loadHebcalCore, loadHebcalLeyning } from './library';
import { HEBREW_LOCALES } from './locales';

export const torahOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['torah'] } },
	options: [
		{
			name: 'Annual Schedule',
			value: 'schedule',
			description: 'Every Shabbat reading or holiday displacement of a Hebrew year',
			action: 'Get the annual schedule',
		},
		{
			name: 'Find Containing Date',
			value: 'containing',
			description: 'Find the date a parsha is read, including inside doubled readings',
			action: 'Find a containing date',
		},
		{
			name: 'Find Parsha Date',
			value: 'find',
			description: 'Find the exact date a named parsha is read in a Hebrew year',
			action: 'Find a parsha date',
		},
		{
			name: 'Format Aliyah',
			value: 'formatAliyah',
			description: 'Format a Torah passage as short and full citations',
			action: 'Format an aliyah',
		},
		{
			name: 'Parsha Reading',
			value: 'parsha',
			description: 'Full Shabbat reading, Haftarah, and alternatives for a named parsha',
			action: 'Get a parsha reading',
		},
		{
			name: 'Readings on Date',
			value: 'reading',
			description: 'All Torah readings for a date, including holidays and Mincha',
			action: 'Get readings on a date',
		},
		{
			name: 'Sedra Lookup',
			value: 'sedra',
			description: 'The parsha read on the first Saturday on or after a date',
			action: 'Look up the sedra',
		},
		{
			name: 'Shabbat Reading',
			value: 'shabbat',
			description: 'Full reading for the Parashat HaShavua of a date',
			action: 'Get the shabbat reading',
		},
		{
			name: 'Weekday Reading',
			value: 'weekday',
			description: 'The Monday or Thursday portion for a date, if any',
			action: 'Get the weekday reading',
		},
	],
	default: 'sedra',
};

const showFor = (operations: string[]) => ({
	show: { resource: ['torah'], operation: operations },
});
const DATE_OPS = ['sedra', 'weekday', 'reading', 'shabbat'];

export const torahFields: INodeProperties[] = [
	...dateInputProperties('date', 'torah', DATE_OPS),
	{
		displayName: 'Hebrew Year',
		name: 'hebrewYear',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 5786,
		displayOptions: showFor(['find', 'containing', 'schedule']),
	},
	{
		displayName: 'Israel Schedule',
		name: 'israelSchedule',
		type: 'boolean',
		default: false,
		description: 'Whether to use the Israeli Torah-reading schedule',
		displayOptions: showFor([
			'sedra',
			'weekday',
			'find',
			'containing',
			'schedule',
			'reading',
			'shabbat',
		]),
	},
	{
		displayName: 'Parsha Name',
		name: 'parshaName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Pinchas',
		description: 'Sephardic transliteration; doubled parshiyot as Matot-Masei',
		displayOptions: showFor(['find', 'containing', 'parsha']),
	},
	{
		displayName: 'Locale',
		name: 'locale',
		type: 'options',
		options: HEBREW_LOCALES,
		default: 'en',
		description: 'Language used for reading names and summaries',
		displayOptions: showFor(['reading', 'parsha', 'shabbat', 'formatAliyah']),
	},
	{
		displayName: 'Book',
		name: 'aliyahBook',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Numbers',
		description: 'Tanakh book name in English, for example Genesis or Isaiah',
		displayOptions: showFor(['formatAliyah']),
	},
	{
		displayName: 'Begin',
		name: 'aliyahBegin',
		type: 'string',
		required: true,
		default: '',
		placeholder: '25:10',
		description: 'Beginning chapter and verse',
		displayOptions: showFor(['formatAliyah']),
	},
	{
		displayName: 'End',
		name: 'aliyahEnd',
		type: 'string',
		required: true,
		default: '',
		placeholder: '30:1',
		description: 'Ending chapter and verse',
		displayOptions: showFor(['formatAliyah']),
	},
	{
		displayName: 'Show Book',
		name: 'aliyahShowBook',
		type: 'boolean',
		default: true,
		description: 'Whether the short citation includes the book name',
		displayOptions: showFor(['formatAliyah']),
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: showFor(['schedule']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, numberPrecision: 0 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['torah'], operation: ['schedule'], returnAll: [false] },
		},
	},
];

export function serializeAliyot(aliyot: AliyotMap | undefined): IDataObject | null {
	if (!aliyot) return null;
	const output: IDataObject = {};
	for (const [key, aliyah] of Object.entries(aliyot)) {
		const entry: IDataObject = { book: aliyah.k, begin: aliyah.b, end: aliyah.e };
		if (aliyah.v !== undefined) entry.verses = aliyah.v;
		if (aliyah.p !== undefined) entry.parshaNumber = aliyah.p;
		if (aliyah.reason !== undefined) entry.reason = aliyah.reason;
		output[key] = entry;
	}
	return output;
}

export function serializeHaftarah(haft: Aliyah | Aliyah[] | undefined): IDataObject | null {
	if (!haft) return null;
	const passages = (Array.isArray(haft) ? haft : [haft]).map((aliyah) => ({
		book: aliyah.k,
		begin: aliyah.b,
		end: aliyah.e,
		verses: aliyah.v ?? null,
	}));
	return { passages };
}

export function serializeLeyning(reading: Leyning | LeyningWeekday): IDataObject {
	const full = reading as Partial<Leyning>;
	return {
		name: reading.name,
		type: reading.type,
		summary: reading.summary,
		summaryParts: full.summaryParts ?? null,
		note: full.note ?? null,
		parsha: full.parsha ?? null,
		parshaNumber: full.parshaNum ?? null,
		fullkriyah: serializeAliyot(full.fullkriyah),
		weekday: serializeAliyot(full.weekday),
		haftara: full.haftara ?? null,
		haft: serializeHaftarah(full.haft),
		haftaraVerses: full.haftaraNumV ?? null,
		sephardicHaftara: full.sephardic ?? null,
		sephardicVerses: full.sephardicNumV ?? null,
		seph: serializeHaftarah(full.seph),
		chabad: serializeHaftarah(full.chabad),
		megillah: serializeAliyot(full.megillah),
		alternate: serializeAliyot(full.alt),
		reason: full.reason ?? null,
		triHaftara: full.triHaftara ?? null,
		triHaftaraVerses: full.triHaftaraNumV ?? null,
	};
}

function requiredHebrewYear(ctx: IExecuteFunctions, itemIndex: number): number {
	const year = requiredInteger(ctx.getNodeParameter('hebrewYear', itemIndex), 'Hebrew year');
	if (year < 1 || year > 9999) throw new RangeError('Hebrew year must be between 1 and 9999');
	return year;
}

function requiredParshaName(ctx: IExecuteFunctions, itemIndex: number): string {
	const name = ctx.getNodeParameter('parshaName', itemIndex) as string;
	if (!name?.trim()) throw new RangeError('Parsha name is required');
	return name.trim();
}

export async function executeTorah(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const core = await loadHebcalCore();
	const leyning = await loadHebcalLeyning();

	switch (operation) {
		case 'sedra':
		case 'weekday': {
			const date = await getDateParameter(ctx, itemIndex, 'date');
			const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
			const sedra = core.getSedra(date.getFullYear(), israel);
			const result = operation === 'sedra' ? sedra.lookup(date) : sedra.lookupWeekday(date);
			if (!result) return [{ reading: null }];
			return [
				{
					parsha: result.parsha,
					number: result.num,
					chag: result.chag,
					readingDate: serializeHebrewDate(result.hdate),
					israel: result.il,
				},
			];
		}
		case 'find':
		case 'containing': {
			const year = requiredHebrewYear(ctx, itemIndex);
			const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
			const name = requiredParshaName(ctx, itemIndex);
			const sedra = core.getSedra(year, israel);
			const found = operation === 'find' ? sedra.find(name) : sedra.findContaining(name);
			return [
				{
					parsha: name,
					hebrewYear: year,
					israel,
					date: found ? serializeHebrewDate(found) : null,
				},
			];
		}
		case 'schedule': {
			const year = requiredHebrewYear(ctx, itemIndex);
			const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
			const sedra = core.getSedra(year, israel);
			const firstSaturday = sedra.getFirstSaturday();
			const entries = sedra.getSedraArray().map((_, index) => {
				const result = sedra.lookup(new core.HDate(firstSaturday + index * 7));
				return {
					date: serializeHebrewDate(result.hdate),
					parsha: result.parsha,
					number: result.num,
					chag: result.chag,
				};
			});
			const returnAll = ctx.getNodeParameter('returnAll', itemIndex) as boolean;
			if (returnAll) return entries;
			const limit = requiredInteger(ctx.getNodeParameter('limit', itemIndex), 'Limit');
			if (limit < 1) throw new RangeError('Limit must be at least 1');
			return entries.slice(0, limit);
		}
		case 'reading': {
			const date = await getDateParameter(ctx, itemIndex, 'date');
			const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
			const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';
			const readings = leyning.getLeyningOnDate(date, israel, true, locale);
			return readings.map((reading) => serializeLeyning(reading));
		}
		case 'parsha': {
			const name = requiredParshaName(ctx, itemIndex);
			const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';
			return [serializeLeyning(leyning.getLeyningForParsha(name, locale))];
		}
		case 'formatAliyah': {
			const book = ctx.getNodeParameter('aliyahBook', itemIndex) as string;
			const begin = ctx.getNodeParameter('aliyahBegin', itemIndex) as string;
			const end = ctx.getNodeParameter('aliyahEnd', itemIndex) as string;
			const showBook = ctx.getNodeParameter('aliyahShowBook', itemIndex) as boolean;
			const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';
			if (!book?.trim()) throw new RangeError('Book is required');
			if (!/^\d+:\d+$/.test(begin?.trim() ?? '')) {
				throw new RangeError('Begin must use chapter:verse format');
			}
			if (!/^\d+:\d+$/.test(end?.trim() ?? '')) {
				throw new RangeError('End must use chapter:verse format');
			}
			const aliyah = { k: book.trim(), b: begin.trim(), e: end.trim() } as Aliyah;
			return [
				{
					book: aliyah.k,
					begin: aliyah.b,
					end: aliyah.e,
					short: leyning.formatAliyahShort(aliyah, showBook, locale),
					full: leyning.formatAliyahWithBook(aliyah),
				},
			];
		}
		case 'shabbat': {
			const date = await getDateParameter(ctx, itemIndex, 'date');
			const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
			const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';
			const result = core.getSedra(date.getFullYear(), israel).lookup(date);
			if (result.chag) {
				throw new RangeError(
					`${result.parsha.join(' and ')} is a holiday reading, not a regular parsha; use the Readings on Date operation instead`,
				);
			}
			const reading = leyning.getLeyningForParshaHaShavua(
				new core.ParshaEvent(result),
				israel,
				locale,
			);
			return [serializeLeyning(reading)];
		}
		default:
			throw new RangeError(`Unsupported Torah operation: ${operation}`);
	}
}
