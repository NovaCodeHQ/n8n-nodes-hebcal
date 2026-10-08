import type { IDataObject } from 'n8n-workflow';
import { serializeHebrewDate } from './dateUtils';
import type { HebcalCore, HebrewDate } from './library';

export type HebcalEvent = InstanceType<HebcalCore['Event']>;
export type HebcalMolad = InstanceType<HebcalCore['Molad']>;

export const EVENT_FLAG_OPTIONS = [
	{ name: 'BeHaB', value: 'BEHAB' },
	{ name: 'Chag (Yom Tov)', value: 'CHAG' },
	{ name: 'Chanukah Candles', value: 'CHANUKAH_CANDLES' },
	{ name: 'Chol HaMoed', value: 'CHOL_HAMOED' },
	{ name: 'Chul Only (Diaspora)', value: 'CHUL_ONLY' },
	{ name: 'Daf Yomi', value: 'DAF_YOMI' },
	{ name: 'Daily Learning', value: 'DAILY_LEARNING' },
	{ name: 'Erev', value: 'EREV' },
	{ name: 'Hebrew Date', value: 'HEBREW_DATE' },
	{ name: 'Il Only (Israel)', value: 'IL_ONLY' },
	{ name: 'Light Candles', value: 'LIGHT_CANDLES' },
	{ name: 'Light Candles Tzeis', value: 'LIGHT_CANDLES_TZEIS' },
	{ name: 'Major Fast', value: 'MAJOR_FAST' },
	{ name: 'Minor Fast', value: 'MINOR_FAST' },
	{ name: 'Minor Holiday', value: 'MINOR_HOLIDAY' },
	{ name: 'Mishna Yomi', value: 'MISHNA_YOMI' },
	{ name: 'Modern Holiday', value: 'MODERN_HOLIDAY' },
	{ name: 'Molad', value: 'MOLAD' },
	{ name: 'Nach Yomi', value: 'NACH_YOMI' },
	{ name: 'Omer Count', value: 'OMER_COUNT' },
	{ name: 'Parsha Hashavua', value: 'PARSHA_HASHAVUA' },
	{ name: 'Rosh Chodesh', value: 'ROSH_CHODESH' },
	{ name: 'Shabbat Mevarchim', value: 'SHABBAT_MEVARCHIM' },
	{ name: 'Special Shabbat', value: 'SPECIAL_SHABBAT' },
	{ name: 'User Event', value: 'USER_EVENT' },
	{ name: 'Yerushalmi Yomi', value: 'YERUSHALMI_YOMI' },
	{ name: 'Yizkor', value: 'YIZKOR' },
	{ name: 'Yom Kippur Katan', value: 'YOM_KIPPUR_KATAN' },
	{ name: 'Yom Tov Ends', value: 'YOM_TOV_ENDS' },
];

function safeUrl(event: HebcalEvent): string | null {
	try {
		return event.url() ?? null;
	} catch {
		return null;
	}
}

function instantToString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') return value;
	try {
		return String(value);
	} catch {
		return null;
	}
}

function dateToIso(date: unknown): string | null {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

export function serializeMolad(molad: HebcalMolad, locale = 'en'): IDataObject {
	return {
		year: molad.getYear(),
		month: molad.getMonth(),
		monthName: molad.getMonthName(),
		date: serializeHebrewDate(molad.getMoladDate(), locale),
		weekday: molad.getDow(),
		hour: molad.getHour(),
		minutes: molad.getMinutes(),
		chalakim: molad.getChalakim(),
		instant: instantToString(molad.getInstant()),
		kiddushLevana: {
			threeDays: instantToString(molad.getTchilasZmanKidushLevana3Days()),
			sevenDays: instantToString(molad.getTchilasZmanKidushLevana7Days()),
			betweenMoldos: instantToString(molad.getSofZmanKidushLevanaBetweenMoldos()),
			fifteenDays: instantToString(molad.getSofZmanKidushLevana15Days()),
		},
		rendered: molad.render(locale),
	};
}

function serializeTimedFields(event: HebcalEvent): IDataObject | null {
	if (!('eventTime' in event)) return null;
	const timed = event as HebcalEvent & {
		eventTime: Date;
		eventTimeStr?: string;
		fmtTime?: string;
		location?: { getTzid?: () => string };
		linkedEvent?: HebcalEvent;
	};
	const location = timed.location;
	return {
		eventTime: dateToIso(timed.eventTime),
		eventTimeStr: timed.eventTimeStr ?? null,
		timeLocal: timed.fmtTime ?? null,
		timezone: location?.getTzid?.() ?? null,
		linkedEvent: timed.linkedEvent
			? {
					description: timed.linkedEvent.getDesc(),
					rendered: timed.linkedEvent.render(),
				}
			: null,
	};
}

function serializeLearningFields(
	event: HebcalEvent & Record<string, unknown>,
): IDataObject | null {
	const daf = event.daf as
		| { name?: unknown; blatt?: unknown; cycle?: unknown; ed?: unknown }
		| undefined;
	const chapterBook = event.k;
	const chapterNumber = event.v;
	const hasLearning =
		daf !== undefined ||
		event.reading !== undefined ||
		event.readings !== undefined ||
		event.mishnaYomi !== undefined ||
		typeof chapterBook === 'string';
	if (!hasLearning) return null;
	const category = (event as { category?: unknown }).category;
	return {
		category: typeof category === 'string' ? category : null,
		daf:
			daf && typeof daf === 'object'
				? {
						name: typeof daf.name === 'string' ? daf.name : null,
						blatt:
							typeof daf.blatt === 'string' || typeof daf.blatt === 'number'
								? daf.blatt
								: null,
						cycle: typeof daf.cycle === 'number' ? daf.cycle : null,
						edition: typeof daf.ed === 'string' ? daf.ed : null,
					}
				: null,
		reading: (event.reading ?? null) as IDataObject | null,
		readings: (event.readings ?? null) as IDataObject | null,
		mishnaYomi: (event.mishnaYomi ?? null) as IDataObject | null,
		chapter:
			typeof chapterBook === 'string' && typeof chapterNumber === 'number'
				? { book: chapterBook, chapter: chapterNumber }
				: null,
	};
}

export function serializeEvent(event: HebcalEvent, locale = 'en'): IDataObject {
	const date: HebrewDate = event.getDate();
	const output: IDataObject = {
		date: serializeHebrewDate(date, locale),
		title: event.render(locale),
		titleBrief: event.renderBrief(locale),
		basename: event.basename(),
		description: event.getDesc(),
		mask: event.mask,
		flags: event.flagNames(),
		categories: event.getCategories(),
		url: safeUrl(event),
		memo: event.memo ?? null,
		emoji: event.getEmoji() ?? null,
		observedInIsrael: event.observedInIsrael(),
		observedInDiaspora: event.observedInDiaspora(),
		alarm:
			event.alarm instanceof Date
				? dateToIso(event.alarm)
				: ((event.alarm ?? null) as string | boolean | null),
	};

	const timed = serializeTimedFields(event);
	if (timed) output.timed = timed;

	const withExtras = event as HebcalEvent & Record<string, unknown>;
	if (typeof withExtras.omer === 'number') {
		const omer = event as HebcalEvent & {
			omer: number;
			getWeeks: () => number;
			getDaysWithinWeeks: () => number;
			sefira: (lang?: string) => string;
			getTodayIs: (locale: string) => string;
			getLamnatzeachWord: () => string;
			getLamnatzeachLetter: () => string;
			getAnaBekoachWord: () => string;
		};
		output.omer = {
			day: omer.omer,
			weeks: omer.getWeeks(),
			daysWithinWeek: omer.getDaysWithinWeeks(),
			sefira: {
				en: omer.sefira('en'),
				he: omer.sefira('he'),
				translit: omer.sefira('translit'),
			},
			todayIs: omer.getTodayIs(locale),
			lamnatzeach: { word: omer.getLamnatzeachWord(), letter: omer.getLamnatzeachLetter() },
			anaBekoach: omer.getAnaBekoachWord(),
		};
	}

	if (withExtras.molad && typeof withExtras.molad === 'object') {
		output.molad = serializeMolad(withExtras.molad as HebcalMolad, locale);
	}

	if (typeof withExtras.chanukahDay === 'number') output.chanukahDay = withExtras.chanukahDay;
	if (typeof withExtras.cholHaMoedDay === 'number') output.cholHaMoedDay = withExtras.cholHaMoedDay;
	if (typeof withExtras.observed === 'boolean') output.postponed = withExtras.observed;
	if (typeof withExtras.monthName === 'string') output.monthName = withExtras.monthName;

	const parsha = withExtras.parsha;
	const parshaResult = withExtras.p as
		| { parsha?: string[]; num?: number; chag?: boolean }
		| undefined;
	if (Array.isArray(parsha) || parshaResult?.parsha) {
		output.parsha = {
			names: Array.isArray(parsha) ? parsha : (parshaResult?.parsha ?? []),
			number: parshaResult?.num ?? null,
			chag: parshaResult?.chag ?? null,
		};
	}

	const startEvent = withExtras.startEvent as HebcalEvent | undefined;
	const endEvent = withExtras.endEvent as HebcalEvent | undefined;
	if (startEvent || endEvent) {
		output.fast = {
			start: startEvent ? serializeEvent(startEvent, locale) : null,
			end: endEvent ? serializeEvent(endEvent, locale) : null,
		};
		const linked = withExtras.linkedEvent as HebcalEvent | undefined;
		if (linked) {
			output.fastHoliday = {
				description: linked.getDesc(),
				rendered: linked.render(locale),
				flags: linked.flagNames(),
			};
		}
	}

	const learning = serializeLearningFields(withExtras);
	if (learning) output.learning = learning;

	return output;
}
