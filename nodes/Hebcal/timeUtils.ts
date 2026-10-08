import type { Temporal } from 'temporal-polyfill' with { 'resolution-mode': 'import' };
import { requiredString } from './dateUtils';
import type { HebrewDate } from './library';

export type ZonedDateTime = Temporal.ZonedDateTime;
export type PlainDate = Temporal.PlainDate;

function getTemporal(): typeof Temporal {
	const temporal = (globalThis as { Temporal?: typeof Temporal }).Temporal;
	if (!temporal) {
		throw new RangeError('Temporal API is unavailable; load the Hebcal packages first');
	}
	return temporal;
}

export function dateToIsoString(date: unknown): string | null {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

/**
 * The same instant rendered in a target timezone, e.g.
 * `2024-03-08T06:18:04-05:00[America/New_York]`. Null for missing times,
 * exactly mirroring {@link dateToIsoString}.
 */
export function dateToLocalIso(date: unknown, tzid: string): string | null {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
	return getTemporal()
		.Instant.fromEpochMilliseconds(date.getTime())
		.toZonedDateTimeISO(tzid)
		.toString();
}

export function temporalToString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	try {
		return String(value);
	} catch {
		return null;
	}
}

export function parseZonedInstant(value: unknown, label: string): Temporal.ZonedDateTime {
	const text = requiredString(value, label);
	const TemporalAPI = getTemporal();
	let parsed: Temporal.ZonedDateTime | undefined;
	try {
		parsed = TemporalAPI.ZonedDateTime.from(text);
	} catch {
		parsed = undefined;
	}
	if (!parsed) {
		// Accept instants without a named timezone, such as a bare Zulu offset.
		let instant: Temporal.Instant | undefined;
		try {
			instant = TemporalAPI.Instant.from(text);
		} catch {
			instant = undefined;
		}
		parsed = instant?.toZonedDateTimeISO('UTC');
	}
	if (!parsed) {
		throw new RangeError(
			`${label} must be an ISO-8601 instant with a timezone or offset, for example 2024-03-08T12:00:00-05:00[America/New_York]`,
		);
	}
	return parsed;
}

export function parseOptionalInstant(value: unknown, label: string): Temporal.ZonedDateTime | null {
	if (value === undefined || value === null) return null;
	if (typeof value === 'string' && value.trim() === '') return null;
	return parseZonedInstant(value, label);
}

/**
 * Local noon on the civil Gregorian date in the target timezone.
 * Components come from the host-local civil Date, so the result does not
 * depend on the server timezone.
 */
export function noonInTimezone(date: HebrewDate, tzid: string): Temporal.ZonedDateTime {
	const TemporalAPI = getTemporal();
	const gregorian = date.greg();
	const plainDate = TemporalAPI.PlainDate.from({
		year: gregorian.getFullYear(),
		month: gregorian.getMonth() + 1,
		day: gregorian.getDate(),
	});
	return plainDate.toPlainDateTime({ hour: 12 }).toZonedDateTime(tzid);
}

export function plainDateFor(date: HebrewDate): Temporal.PlainDate {
	const gregorian = date.greg();
	return getTemporal().PlainDate.from({
		year: gregorian.getFullYear(),
		month: gregorian.getMonth() + 1,
		day: gregorian.getDate(),
	});
}
