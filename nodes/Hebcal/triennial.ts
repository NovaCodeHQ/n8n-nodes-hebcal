import { Writable } from 'node:stream';
import type { WriteStream } from 'node:fs';
import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import type { TriennialAliyot } from '@hebcal/triennial' with { 'resolution-mode': 'import' };
import {
	dateInputProperties,
	getDateParameter,
	requiredInteger,
	serializeHebrewDate,
} from './dateUtils';
import { loadHebcalCore, loadHebcalLeyning, loadHebcalTriennial } from './library';
import { serializeAliyot, serializeHaftarah } from './torah';

export const triennialOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['triennial'] } },
	options: [
		{
			name: 'Cycle Information',
			value: 'cycle',
			description: 'Triennial cycle year and start year for a Hebrew year',
			action: 'Get triennial cycle information',
		},
		{
			name: 'Holiday Haftarot',
			value: 'holidayHaftara',
			description: 'Alternative triennial Haftarot for holidays on a date',
			action: 'Get holiday haftarot',
		},
		{
			name: 'Parsha Reading',
			value: 'parsha',
			description: 'Triennial aliyot for the Parashat HaShavua of a date',
			action: 'Get a triennial parsha reading',
		},
		{
			name: 'Reading by Name',
			value: 'reading',
			description: 'Triennial aliyot for a named parsha and cycle year',
			action: 'Get a triennial reading by name',
		},
		{
			name: 'Year CSV',
			value: 'csv',
			description: 'Triennial readings CSV for a Hebrew year, as text',
			action: 'Get the triennial CSV',
		},
	],
	default: 'parsha',
};

const CYCLE_YEAR_OPTIONS = [
	{ name: 'Year 1', value: 1 },
	{ name: 'Year 2', value: 2 },
	{ name: 'Year 3', value: 3 },
];

const showFor = (operations: string[]) => ({
	show: { resource: ['triennial'], operation: operations },
});

export const triennialFields: INodeProperties[] = [
	...dateInputProperties('date', 'triennial', ['parsha', 'holidayHaftara']),
	{
		displayName: 'Hebrew Year',
		name: 'hebrewYear',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 5786,
		description: 'Triennial readings start with Hebrew year 5744',
		displayOptions: showFor(['reading', 'cycle', 'csv']),
	},
	{
		displayName: 'Israel Schedule',
		name: 'israelSchedule',
		type: 'boolean',
		default: false,
		description: 'Whether to use the Israeli Torah-reading schedule',
		displayOptions: showFor(['parsha', 'reading', 'cycle', 'csv']),
	},
	{
		displayName: 'Parsha Name',
		name: 'parshaName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Bereshit',
		description: 'Sephardic transliteration; doubled parshiyot as Matot-Masei',
		displayOptions: showFor(['reading']),
	},
	{
		displayName: 'Cycle Year',
		name: 'cycleYear',
		type: 'options',
		noDataExpression: true,
		options: CYCLE_YEAR_OPTIONS,
		required: true,
		default: 1,
		displayOptions: showFor(['reading', 'holidayHaftara']),
	},
];

export function serializeTriennialAliyot(reading: TriennialAliyot): IDataObject {
	return {
		aliyot: serializeAliyot(reading.aliyot),
		cycleYear: reading.yearNum === undefined ? null : reading.yearNum + 1,
		date: reading.date ? serializeHebrewDate(reading.date) : null,
		readSeparately: reading.readSeparately ?? null,
		readTogether: reading.readTogether ?? null,
		firstDate: reading.date1 ? serializeHebrewDate(reading.date1) : null,
		secondDate: reading.date2 ? serializeHebrewDate(reading.date2) : null,
		fullParsha: reading.fullParsha ?? null,
		haftara: reading.haftara ?? null,
		haftaraVerses: reading.haftaraNumV ?? null,
		haft: serializeHaftarah(reading.haft),
		variation: reading.variation ?? null,
	};
}

class StringWriter extends Writable {
	data = '';

	_write(chunk: unknown, _encoding: string, callback: (error?: Error | null) => void): void {
		this.data += String(chunk);
		callback();
	}
}

function requiredCycleIndex(ctx: IExecuteFunctions, itemIndex: number): number {
	const cycleYear = requiredInteger(ctx.getNodeParameter('cycleYear', itemIndex), 'Cycle year');
	if (cycleYear < 1 || cycleYear > 3) throw new RangeError('Cycle year must be 1, 2, or 3');
	return cycleYear - 1;
}

function requiredHebrewYear(ctx: IExecuteFunctions, itemIndex: number): number {
	const year = requiredInteger(ctx.getNodeParameter('hebrewYear', itemIndex), 'Hebrew year');
	if (year < 5744 || year > 9999) {
		throw new RangeError('Triennial readings require a Hebrew year of 5744 or later');
	}
	return year;
}

async function parshaEventFor(
	ctx: IExecuteFunctions,
	itemIndex: number,
): Promise<{
	event: InstanceType<Awaited<ReturnType<typeof loadHebcalCore>>['ParshaEvent']>;
	israel: boolean;
}> {
	const core = await loadHebcalCore();
	const date = await getDateParameter(ctx, itemIndex, 'date');
	const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
	const result = core.getSedra(date.getFullYear(), israel).lookup(date);
	if (result.chag) {
		throw new RangeError(
			`${result.parsha.join(' and ')} is a holiday reading, not a regular parsha; use the Torah Readings on Date operation instead`,
		);
	}
	return { event: new core.ParshaEvent(result), israel };
}

export async function executeTriennial(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const triennial = await loadHebcalTriennial();

	switch (operation) {
		case 'parsha': {
			const { event, israel } = await parshaEventFor(ctx, itemIndex);
			return [serializeTriennialAliyot(triennial.getTriennialForParshaHaShavua(event, israel))];
		}
		case 'reading': {
			const year = requiredHebrewYear(ctx, itemIndex);
			const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
			const name = ctx.getNodeParameter('parshaName', itemIndex) as string;
			if (!name?.trim()) throw new RangeError('Parsha name is required');
			const index = requiredCycleIndex(ctx, itemIndex);
			const schedule = triennial.getTriennial(year, israel);
			return [serializeTriennialAliyot(schedule.getReading(name.trim(), index))];
		}
		case 'cycle': {
			const year = requiredHebrewYear(ctx, itemIndex);
			const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
			const schedule = triennial.getTriennial(year, israel);
			return [
				{
					hebrewYear: year,
					cycleYear: triennial.Triennial.getYearNumber(year),
					cycleStartYear: triennial.Triennial.getCycleStartYear(year),
					scheduleStartYear: schedule.getStartYear(),
					israel: schedule.getIsrael(),
				},
			];
		}
		case 'holidayHaftara': {
			const core = await loadHebcalCore();
			const leyning = await loadHebcalLeyning();
			const date = await getDateParameter(ctx, itemIndex, 'date');
			const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
			const index = requiredCycleIndex(ctx, itemIndex);
			const holidays = core.getHolidaysOnDate(date) ?? [];
			const results: IDataObject[] = [];
			for (const holiday of holidays) {
				const key = leyning.getLeyningKeyForEvent(holiday, israel);
				if (!key) continue;
				const haftara = triennial.getTriennialHaftaraForHoliday(key, index);
				if (!haftara) continue;
				results.push({
					holiday: holiday.getDesc(),
					date: serializeHebrewDate(holiday.getDate()),
					key,
					triHaftara: haftara.haftara,
					triHaftaraVerses: haftara.haftaraNumV ?? null,
					haft: serializeHaftarah(haftara.haft),
				});
			}
			return results;
		}
		case 'csv': {
			const year = requiredHebrewYear(ctx, itemIndex);
			const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
			const writer = new StringWriter();
			// SAFETY: writeTriennialCsv only calls .write(string) on the stream,
			// which StringWriter implements; no filesystem access occurs.
			triennial.writeTriennialCsv(writer as unknown as WriteStream, year, israel);
			return [{ hebrewYear: year, israel, csv: writer.data }];
		}
		default:
			throw new RangeError(`Unsupported Triennial operation: ${operation}`);
	}
}
