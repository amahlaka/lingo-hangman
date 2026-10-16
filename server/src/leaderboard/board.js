// Weekly leaderboards: opt-in, anonymous, ranked by XP earned this week
// (Monday to Sunday, Finnish time). Learners are compared with others of a
// similar level: members are put in groups of about GROUP_SIZE by their XP
// over the four weeks before this one, so the groups stay the same all week.
// A board shows the top TOP_LENGTH and the few learners just around you.

import { addDays } from "../../../src/lib/progress.js";
import { localNow } from "../push/reminders.js";

export const GROUP_SIZE = 30;
export const TOP_LENGTH = 10;
export const AROUND = 2;
const WEEK_ZONE = "Europe/Helsinki";
const HISTORY_DAYS = 28;

const ADJECTIVES = [
  "Brave", "Bright", "Calm", "Cheerful", "Clever", "Cosy", "Curious", "Eager", "Gentle", "Happy",
  "Jolly", "Kind", "Lively", "Lucky", "Merry", "Mighty", "Nimble", "Patient", "Quick", "Quiet",
  "Sunny", "Swift", "Steady", "Plucky", "Witty", "Bold", "Daring", "Friendly", "Keen", "Sparkly",
];
const ANIMALS = [
  "Otter", "Fox", "Owl", "Moose", "Lynx", "Hare", "Seal", "Puffin", "Badger", "Beaver",
  "Hedgehog", "Squirrel", "Reindeer", "Wolf", "Bear", "Crane", "Swan", "Robin", "Salmon", "Heron",
  "Panda", "Koala", "Penguin", "Dolphin", "Raven", "Marten", "Pike", "Wren", "Stoat", "Elk",
];

export function randomNickname(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)} ${10 + Math.floor(random() * 90)}`;
}

// A nickname no other member has.
export function freshNickname(db, random = Math.random) {
  const taken = db.prepare("SELECT 1 FROM leaderboard_members WHERE nickname = ?");
  for (let i = 0; i < 50; i++) {
    const name = randomNickname(random);
    if (!taken.get(name)) return name;
  }
  return `${randomNickname(random)}${Math.floor(random() * 1000)}`;
}

// This week's first and last day ("YYYY-MM-DD"), Monday to Sunday.
export function weekOf(now = Date.now()) {
  const today = localNow(now, WEEK_ZONE).day;
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday 0
  const start = addDays(today, -weekday);
  return { start, end: addDays(start, 6) };
}

const xpBetween = (days, from, to) => {
  let xp = 0;
  for (const [day, d] of Object.entries(days || {})) if (day >= from && day <= to) xp += d.xp || 0;
  return xp;
};

// Split members (sorted by past XP, most first) into groups of about GROUP_SIZE.
export function groupsOf(sorted, size = GROUP_SIZE) {
  const count = Math.max(1, Math.round(sorted.length / size));
  const per = Math.ceil(sorted.length / count);
  const groups = [];
  for (let i = 0; i < sorted.length; i += per) groups.push(sorted.slice(i, i + per));
  return groups;
}

// The board for `userId`, or { joined: false }.
export function boardFor(db, userId, now = Date.now()) {
  const week = weekOf(now);
  const historyFrom = addDays(week.start, -HISTORY_DAYS);
  const dayBefore = addDays(week.start, -1);
  const rows = db
    .prepare(
      `SELECT m.user_id, m.nickname, s.state FROM leaderboard_members m
       LEFT JOIN account_state s ON s.user_id = m.user_id`
    )
    .all();
  const members = rows.map((r) => {
    const days = r.state ? JSON.parse(r.state).days : {};
    return { userId: r.user_id, nickname: r.nickname, past: xpBetween(days, historyFrom, dayBefore), xp: xpBetween(days, week.start, week.end) };
  });
  const me = members.find((m) => m.userId === userId);
  if (!me) return { joined: false, week };

  const byPast = [...members].sort((a, b) => b.past - a.past || a.userId - b.userId);
  const group = groupsOf(byPast).find((g) => g.includes(me));
  // Ranked by this week's XP; learners with none yet only show as you.
  const ranked = group.filter((m) => m.xp > 0 || m === me).sort((a, b) => b.xp - a.xp || a.nickname.localeCompare(b.nickname));
  let rank = 0;
  const entries = ranked.map((m, i) => {
    if (i === 0 || m.xp !== ranked[i - 1].xp) rank = i + 1;
    return { rank, nickname: m.nickname, xp: m.xp, me: m === me };
  });
  const mine = entries.find((e) => e.me);
  const myIndex = entries.indexOf(mine);
  const top = entries.slice(0, TOP_LENGTH);
  const around = me.xp === 0 || myIndex < TOP_LENGTH ? [] : entries.slice(Math.max(TOP_LENGTH, myIndex - AROUND), myIndex + AROUND + 1);
  return {
    joined: true,
    week,
    nickname: me.nickname,
    xp: me.xp,
    rank: me.xp > 0 ? mine.rank : null,
    players: entries.filter((e) => e.xp > 0).length,
    top: me.xp > 0 ? top : top.filter((e) => !e.me),
    around,
  };
}
