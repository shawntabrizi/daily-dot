import { renderHome, type ViewHandle } from "./home";
import type { DataSource } from "./shared/data-source";

/**
 * `#/day?day=N`: that day's hub (Archive board), reached from the calendar,
 * the drawer and the day stepper. The hub sends today (and later) to `#/`;
 * no day, or a malformed one, is today's hub.
 */
export function renderDayPage(
  source: DataSource,
  requestedDay?: number,
): ViewHandle {
  const day = requestedDay !== undefined && Number.isInteger(requestedDay) && requestedDay >= 0
    ? requestedDay
    : null;
  return renderHome(source, day);
}
