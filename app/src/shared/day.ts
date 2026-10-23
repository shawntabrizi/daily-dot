export const EPOCH_SECONDS = 1_767_225_600;
export const DAY_SECONDS = 86_400;
const MAX_U32 = 0xffff_ffff;

export function dayIndexFromTimestamp(timestampSeconds: number): number {
  if (!Number.isFinite(timestampSeconds)) {
    throw new RangeError("Timestamp must be finite");
  }

  if (timestampSeconds < EPOCH_SECONDS) {
    throw new RangeError("Timestamp is before the Daily on Dot epoch");
  }

  const day = Math.floor((timestampSeconds - EPOCH_SECONDS) / DAY_SECONDS);
  if (day > MAX_U32) {
    throw new RangeError("Day index exceeds the contract's u32 range");
  }

  return day;
}

export function dayIndexFromDate(date: Date): number {
  return dayIndexFromTimestamp(date.getTime() / 1_000);
}

export function dateFromDayIndex(day: number): Date {
  if (!Number.isInteger(day) || day < 0) {
    throw new RangeError("Day index must be a non-negative integer");
  }

  return new Date((EPOCH_SECONDS + day * DAY_SECONDS) * 1_000);
}

export function indexForDay(
  day: number,
  startDay: number,
  count: number,
): number {
  assertU32(day, "Day");
  assertU32(startDay, "Start day");
  assertU32(count, "Count");

  if (count === 0) {
    throw new RangeError("Content series must not be empty");
  }

  if (day < startDay) {
    throw new RangeError("Day is before the content series starts");
  }

  return (day - startDay) % count;
}

function assertU32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_U32) {
    throw new RangeError(`${label} must be a u32`);
  }
}

/** "07:12:33": the time to the next set at 00:00 UTC. */
export function countdownText(now = new Date()): string {
  const tomorrow = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  const remaining = Math.max(0, tomorrow - now.getTime());
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
