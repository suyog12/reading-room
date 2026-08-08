export const MAX_CASES_PER_ROOM = 6;
export const SHELVES_PER_CASE = 5;
export const SLOTS_PER_SHELF = 5;
export const BOOKS_PER_CASE = SHELVES_PER_CASE * SLOTS_PER_SHELF; // 25
export const VISIBLE_SHELVES = 2;

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * A page is displayed at roughly 620px wide inside the book. 1800px covers a
 * 2x display with room to spare, and pinch-zoom on a phone. 2400 was storing
 * detail nothing ever renders.
 */
export const PAGE_WIDTH_PX = 1800;
export const THUMB_WIDTH_PX = 280;

/**
 * Byte budget per page. The encoder starts at high quality and steps down
 * until it fits, so a flat photo stays crisp and a busy one gives up a little
 * quality rather than costing a megabyte.
 */
export const PAGE_BYTE_TARGET = 320 * 1024;
export const QUALITY_LADDER = [0.88, 0.82, 0.74, 0.66, 0.58];

/** Video re-encode target when the user opts in. */
export const VIDEO_MAX_WIDTH = 1280;
export const VIDEO_BITRATE = 2_200_000;

export const MEDIA: Record<string, string> = {
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const isVideoType = (t: string) => t.startsWith("video/");

export const TURN_MS = 780;
