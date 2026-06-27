import type { LyricLine } from "../types";

export function parseLRC(lrcString: string): LyricLine[] {
  if (!lrcString || lrcString.trim().length === 0) {
    return [];
  }

  const lines = lrcString.split("\n");
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const timestamps: number[] = [];
    let match: RegExpExecArray | null;

    while ((match = timeRegex.exec(trimmedLine)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const centiseconds = match[3]
        ? parseInt(match[3].padEnd(3, "0").substring(0, 3), 10)
        : 0;

      const totalSeconds = minutes * 60 + seconds + centiseconds / 1000;
      timestamps.push(totalSeconds);
    }

    timeRegex.lastIndex = 0;

    if (timestamps.length === 0) continue;

    const text = trimmedLine
      .replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, "")
      .trim();

    if (/^\[(?:ti|ar|al|by|offset|re|ve):/.test(trimmedLine)) continue;

    for (const time of timestamps) {
      result.push({ time, text });
    }
  }

  result.sort((a, b) => a.time - b.time);

  return result;
}

export function findActiveLyricIndex(
  lyrics: LyricLine[],
  currentTime: number,
): number {
  if (lyrics.length === 0) return -1;

  let low = 0;
  let high = lyrics.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lyrics[mid].time <= currentTime) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}
