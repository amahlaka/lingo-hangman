// Which textbook lessons this device has opened, so the lesson list can tick
// them off and Home can offer the next one. Kept only on this device.

const KEY = "lingoLessonsRead";

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function readLessons() {
  try {
    const list = JSON.parse(storage()?.getItem(KEY) || "[]");
    return new Set(Array.isArray(list) ? list.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function markLessonRead(id) {
  const read = readLessons();
  if (read.has(id)) return read;
  read.add(id);
  try {
    storage()?.setItem(KEY, JSON.stringify([...read]));
  } catch {
    // private mode: remembered for this visit only
  }
  return read;
}

// The first lesson not opened yet, in reading order; null when all are read.
export function nextLesson(lessons, read = readLessons()) {
  return lessons.find((l) => !read.has(l.id)) || null;
}
