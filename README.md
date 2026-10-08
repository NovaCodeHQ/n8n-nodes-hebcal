# n8n-nodes-hebcal

[![npm version](https://img.shields.io/npm/v/n8n-nodes-hebcal)](https://www.npmjs.com/package/n8n-nodes-hebcal)
[![License: GPL-2.0](https://img.shields.io/badge/License-GPL--2.0-blue.svg)](LICENSE)

Self-hosted n8n community node for the Jewish calendar. Provides a single **Hebcal** node that calculates
holidays, Hebrew dates, Torah readings, zmanim, and daily learning schedules **locally** — no API keys,
no credentials, no network requests at execution time.

Powered by [`@hebcal/core`](https://github.com/hebcal/hebcal-es6) and its companion packages
(`hdate`, `learning`, `leyning`, `triennial`, `locales`), bundled into the node.

## Package

```text
n8n-nodes-hebcal
```

Built as an n8n community node package for **self-hosted n8n** instances only.

## Self-hosted only

This package is intended for **self-hosted n8n** only. It is not configured for n8n Cloud verification.

## No credentials

The Hebcal node needs **no credentials**. All calculations run inside the n8n process using the bundled
Hebcal libraries. There is nothing to authenticate and no external service to reach.

## Resources & operations

| Resource    | Operations                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Anniversary | Birthday or Anniversary, Yahrzeit                                                                                                             |
| Calendar    | Generate Calendar                                                                                                                             |
| Hebrew Date | Convert, Format, Parse Gematriya, Adjust, Compare, Weekday, Year Info, Month Info, Month From Name, Gregorian Month Info                      |
| Holiday     | On Date, For Year                                                                                                                             |
| Learning    | Single Date Lookup, Date Range Lookup, List Schedules (21 schedules: Daf Yomi, Mishna Yomi, Rambam, 929, …)                                   |
| Liturgy     | Daily Status (Hallel, Tachanun, Eruv Tavshilin, fast, mourning), Work Prohibition                                                             |
| Molad       | Calculate, For Date                                                                                                                           |
| Omer        | By Day, From Date                                                                                                                             |
| Torah       | Sedra Lookup, Weekday Lookup, Find Parsha, Find Containing, Annual Schedule, Readings on Date, Parsha Reading, Shabbat Reading, Format Aliyah |
| Triennial   | Parsha Reading, Reading by Name, Cycle Info, Holiday Haftarot, Year CSV                                                                       |
| Utility     | Location Lookup, Legacy/USA Timezone Converters, Gematriya, Nikud, Ordinal, Translation, Locales, Holiday Names, Reformat Time                |
| Zmanim      | Daily Times, Custom Calculation, Temporal Hour, Lunar Times, Astronomy, Format Instant                                                        |

### Highlights

- **Calendar** generation supports Gregorian/Hebrew years, exact months, and explicit date ranges, with
  Israel/Diaspora schedules, candle-lighting and Havdalah (including custom minutes/degrees),
  minor-fast and Tisha B'Av timing overrides, weekly portions, Omer, molad, Yizkor, daily learning,
  21 locales, and flag-based filtering.
- **Zmanim** covers the full halachic day (GRA, MGA variants, Baal Hatanya), custom angles and offsets,
  proportional hours, Kiddush Levana windows, and NOAA twilight/solar-position astronomy.
  Uncomputable times (polar regions) return `null`, never fabricated times.
- **Torah** readings include full aliyot with verse counts, Ashkenazi/Sephardi/Chabad haftarot,
  weekday and Mincha readings, plus the triennial cycle with an in-memory CSV export.
- **Learning** exposes all 21 registered schedules (Daf Yomi, Yerushalmi in both editions, Mishna Yomi,
  Nach Yomi, Rambam, 929, and more) for single dates and ranges.
- List operations offer a `Return All` toggle with a `Limit`, and the node honors `continueOnFail`
  with per-item error outputs.

## Installation

### From npm

```bash
npm install n8n-nodes-hebcal
```

Then restart your self-hosted n8n instance.

### Local development

```bash
npm install
npm run build
npm run dev
```

## Example outputs

Hebrew Date → Convert `2024-03-11`:

```json
{
	"gregorian": "2024-03-11",
	"hebrew": { "year": 5784, "month": 13, "monthName": "Adar II", "day": 1 },
	"absoluteDay": 738956,
	"weekday": { "number": 1, "name": "Monday" }
}
```

Zmanim → Daily Times for New York on `2024-03-08` includes:

```json
{
	"times": {
		"sunrise": "2024-03-08T11:18:04.000Z",
		"sunset": "2024-03-08T22:55:43.000Z",
		"chatzot": "2024-03-08T17:06:54.000Z"
	}
}
```

## Compatibility

| Requirement    | Notes                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------- |
| n8n version    | Modern self-hosted n8n versions using `@n8n/node-cli`                                    |
| Node.js        | 18+ required by the Hebcal libraries; 22 LTS recommended for `isolated-vm` compatibility |
| Package format | `@n8n/node-cli` community node package                                                   |
| n8n cloud      | Not supported — self-hosted only                                                         |

## Error handling

Validation and calculation errors throw `NodeOperationError` with the failing item index. The node
respects n8n's `continueOnFail` — errors on individual items produce error JSON outputs rather than
failing the entire execution when enabled. Operations over lists return zero items when nothing
matches; single-result lookups with no applicable data return documented `null` payloads.

## Limitations

- Times are halachic approximations computed with NOAA solar equations; consult your local halachic
  authority for religious practice. Coordinates above the Arctic or below the Antarctic circle cannot
  produce reliable times.
- Gregorian calendar input is limited to the proleptic Gregorian calendar; timed/sedra/learning
  generation is supported for Gregorian years 100–9999, and triennial readings require Hebrew year
  5744 or later.
- Civil dates are interpreted without timezones; instants (for work prohibition, formatting, and
  astronomy) require explicit ISO-8601 strings with a timezone or offset.

## Breaking change from Clover

Versions before this conversion exposed a **Clover** point-of-sale node with API credentials. That
integration has been fully replaced: existing Clover workflows are **not** compatible with the Hebcal
node. See [CHANGELOG.md](CHANGELOG.md) for the labeled history.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Hebcal core API documentation](https://hebcal.github.io/api/core/modules.html)
- [hebcal-es6 on GitHub](https://github.com/hebcal/hebcal-es6)

## Version history

See [CHANGELOG.md](CHANGELOG.md).

## License

GPL-2.0 © [NovaCodeHQ](https://github.com/NovaCodeHQ). See [LICENSE](LICENSE) for the full text and
bundled third-party attributions (@hebcal/\*, temporal-polyfill).
