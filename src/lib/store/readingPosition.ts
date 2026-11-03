"use client";
// Where the person was reading, so returning to Read (or reopening the app) continues there rather than at the top.
// A small, non-sensitive preference: localStorage is enough.

const KEY = "gitaviswa:reading";

export interface ReadingPosition {
  chapter: number;
  verse: string;
  at: number;
}

export function getReadingPosition(): ReadingPosition | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null") as ReadingPosition | null;
    return p && Number.isInteger(p.chapter) && p.chapter >= 1 && p.chapter <= 18 && typeof p.verse === "string" ? p : null;
  } catch {
    return null;
  }
}

export function setReadingPosition(chapter: number, verse: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ chapter, verse, at: Date.now() }));
  } catch {}
}

const LESSON = "gitaviswa:lesson:bg-2-47";
export const lessonDoneAt = (): number | null => {
  try {
    const v = Number(localStorage.getItem(LESSON));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
};
export const markLessonDone = () => {
  try {
    localStorage.setItem(LESSON, String(Date.now()));
  } catch {}
};
