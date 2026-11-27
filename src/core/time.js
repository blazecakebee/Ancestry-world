// Calendar constants shared by sim, atmosphere and UI. world.time counts sim units (DAY_SECONDS real seconds each at 1x);
// a calendar day lasts DAY_LEN units, so people can work a long day between nights.
export const DAY_LEN = 4;
export const YEAR_LEN = 12 * DAY_LEN;
/** Human-readable span for a duration in sim units, e.g. "18h" or "2.5 days". */
export const fmtSpan = (u) => { const h = u * 24 / DAY_LEN; return h < 24 ? `${Math.round(h)}h` : `${+(u / DAY_LEN).toFixed(1)} days`; };
