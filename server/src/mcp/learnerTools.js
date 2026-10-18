// The tools and prompts a learner's own AI assistant gets through
// /api/mcp/me (routes/mcp.js): their own progress, words, mistakes and My
// path, and what Lingo makes of them (src/lib/insights.js, the same analysis
// the Profile page shows). Read only, and only ever the token's own account:
// no tool takes an account id. No email, devices or other learners, except
// the leaderboard's random nicknames the learner already sees in the app.

import { GAME_LIST } from "../../../src/lib/gameList.js";
import { buildInsights, MIN_ANSWERS } from "../../../src/lib/insights.js";
import { wordStanding } from "../../../src/lib/adaptive.js";
import { currentPath, stepDone } from "../../../src/lib/path.js";
import { LEARNED_AFTER_DAYS, answerSummary, dayKey, learnedWords, levelInfo, streakStatus } from "../../../src/lib/progress.js";
import { answerMistakes } from "../../../src/lib/mistakes.js";
import { gemBalance } from "../../../src/lib/cosmetics.js";
import { accountProgress } from "../routes/sync.js";
import { storedPath } from "../routes/path.js";
import { boardFor } from "../leaderboard/board.js";
import { cached } from "../stats/aggregate.js";

const READ = { readOnlyHint: true, openWorldHint: false };
const NO_ARGS = { type: "object", properties: {}, additionalProperties: false };
const LEVEL_NAMES = ["starting", "building", "confident", "strong"];
const WORD_LISTS = ["tricky", "practising", "learned", "known", "all"];
const MAX_MISTAKES = 100;

export const instructions = `Lingo is a free app of short English games for Finnish-speaking adults who want more confidence in English. These tools read the progress of the one learner who connected you: their level, streak and daily goal, the games they play, the words they practise and have learned, how their wrong answers went wrong, their weekly plan ("My path") and what Lingo makes of it all. They can't change anything, and they never show other learners.
Start with get_my_overview. Talk to the learner in their app language (overview.language: "fi" Finnish, "en" English) unless they write in another, keep it warm and short, and celebrate progress: they are adults who often feel unsure of their English, so never shame mistakes. Point them to games by their names and links (the app is at the gameUrl given). English in Lingo is US English.
Numbers come from the answers their devices have synced to their account, so a device that hasn't synced yet is missing.`;

const round2 = (r) => (typeof r === "number" ? Math.round(r * 100) / 100 : null);
const gameInfo = (id, lang, base) => {
  const g = GAME_LIST.find((x) => x.id === id);
  return g ? { game: id, name: lang === "fi" ? g.nameFi : g.name, skill: g.skill, url: `${base}${g.path}` } : { game: id };
};

function learner(db, token) {
  const u = db.prepare("SELECT id, lang, created_at FROM users WHERE id = ?").get(token.user_id);
  return { user: u, state: u ? accountProgress(db, u.id) : null };
}

// Every word the learner has met, with how it stands (src/lib/adaptive.js).
function wordRows(state) {
  return Object.entries(state.words).map(([key, w]) => {
    const at = key.indexOf(":");
    return {
      key,
      word: key.slice(at + 1),
      standing: wordStanding(w),
      learned: (w.days?.length || 0) >= LEARNED_AFTER_DAYS,
      solved: w.solved,
      lost: w.lost,
      recent: w.recent || "",
      last: w.last || w.days?.at(-1) || null,
      ms: w.timed ? Math.round(w.ms / w.timed) : null,
    };
  });
}

function myPath(db, userId, state, insights, lang, base) {
  const { path } = currentPath(storedPath(db, userId).path, state, { games: GAME_LIST, insights });
  return {
    week: path.week,
    placement: path.placement,
    steps: path.steps.map((s) => ({
      ...gameInfo(s.game, lang, base),
      skill: s.skill,
      reason: s.reason,
      goal: s.goal,
      done: stepDone(s, state),
    })),
  };
}

const empty = (user) => ({
  language: user.lang,
  joinedAt: user.created_at,
  progress: null,
  note: "No answers synced to this account yet. Play a few games in Lingo while signed in, then ask again.",
});

export const tools = [
  {
    name: "get_my_overview",
    title: "My progress",
    description:
      "Start here. The learner's app language, level and XP, streak, daily goal, gems, totals, the last 14 days, answers and first-try share per game, word counts by standing, and this week's My path with each step's progress.",
    inputSchema: NO_ARGS,
    annotations: READ,
    run(args, { db, config, token }) {
      const { user, state } = learner(db, token);
      if (!user) return { error: "This account no longer exists." };
      if (!state) return empty(user);
      const base = config.publicUrl;
      const insights = buildInsights(state, { games: GAME_LIST });
      const today = dayKey();
      const level = levelInfo(state.xp);
      const streak = streakStatus(state, today);
      const words = wordRows(state);
      return {
        language: user.lang,
        joinedAt: user.created_at,
        appUrl: base,
        today,
        level: { level: level.level, xp: state.xp, xpToNextLevel: level.toNext },
        streak: { current: streak.current, best: streak.best, playedToday: state.streak.lastDay === today, restDaysLeft: streak.restDaysLeft },
        dailyGoal: { words: state.dailyGoal, today: state.days[today]?.words || 0, met: Boolean(state.days[today]?.goalMet) },
        gems: gemBalance(state),
        totals: { ...state.totals, learnedWords: words.filter((w) => w.learned).length },
        overallLevel: insights.overall ? { level: LEVEL_NAMES[insights.overall.level - 1], firstTryShare: round2(insights.overall.firstTryRate) } : null,
        words: insights.words,
        last14Days: Object.entries(state.days)
          .sort(([a], [b]) => b.localeCompare(a))
          .slice(0, 14)
          .map(([day, d]) => ({ day, words: d.words, solved: d.solved, firstTry: d.firstTry || 0, xp: d.xp || 0, goalMet: Boolean(d.goalMet) })),
        games: answerSummary(state)
          .games.filter((g) => g.id !== "unknown")
          .map((g) => ({ ...gameInfo(g.id, user.lang, base), answers: g.n, firstTryShare: round2(g.firstTryRate), secondsPerAnswer: Math.round(g.meanMs / 100) / 10 })),
        myPath: myPath(db, user.id, state, insights, user.lang, base),
      };
    },
  },
  {
    name: "get_my_words",
    title: "My words",
    description:
      'The words the learner has practised, with how many times each was solved and missed, the last few results ("recent": 2 first try, 1 solved after a miss or slowly, 0 missed; newest last), the day last practised and the average seconds. list: tricky (missed or hesitant lately, the ones most worth practising), practising, learned (solved on 3 different days), known, or all. For tricky words, everyoneFirstTryShare tells how hard the word is for learners in general, when enough learners have answered it.',
    inputSchema: {
      type: "object",
      properties: {
        list: { type: "string", enum: WORD_LISTS, default: "tricky" },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 50 },
      },
      additionalProperties: false,
    },
    annotations: READ,
    run({ list, limit }, { db, token }) {
      const { user, state } = learner(db, token);
      if (!user) return { error: "This account no longer exists." };
      if (!state) return empty(user);
      const rows = wordRows(state);
      let picked;
      if (list === "learned") {
        const order = new Map(learnedWords(state).map((w, i) => [w.key, i]));
        picked = rows.filter((w) => order.has(w.key)).sort((a, b) => order.get(a.key) - order.get(b.key));
      } else {
        picked = list === "all" ? rows : rows.filter((w) => w.standing === list);
        // Most missed first for tricky words, most recent first otherwise.
        picked.sort(list === "tricky" ? (a, b) => b.lost - a.lost || (b.last || "").localeCompare(a.last || "") : (a, b) => (b.last || "").localeCompare(a.last || ""));
      }
      const everyone = list === "tricky" ? cached(db, "difficulty")?.value?.items || {} : {};
      return {
        list,
        count: picked.length,
        words: picked.slice(0, limit).map(({ key, standing, ...w }) => ({
          ...w,
          ...(list === "all" ? { standing } : {}),
          ...(everyone[key] ? { everyoneFirstTryShare: everyone[key].firstTry } : {}),
        })),
      };
    },
  },
  {
    name: "get_my_mistakes",
    title: "My mistakes",
    description:
      "How the learner's wrong answers went wrong, from the answers synced to their account: counts per kind of mistake (spelling, letter_order, word_order, missing_words, different_word, wrong_choice, wrong_sound, wrong_pair, wrong_letters, misheard, skipped), per game, and the latest mistakes with the word asked and what they answered.",
    inputSchema: {
      type: "object",
      properties: {
        game: { type: "string", maxLength: 40, description: "Only this game's mistakes (a game id from get_my_overview)." },
        limit: { type: "integer", minimum: 1, maximum: MAX_MISTAKES, default: 40, description: "How many of the latest mistakes to list." },
      },
      additionalProperties: false,
    },
    annotations: READ,
    run({ game, limit }, { db, config, token }) {
      const { user } = learner(db, token);
      if (!user) return { error: "This account no longer exists." };
      const kinds = {};
      const byGame = {};
      const recent = [];
      const rows = db.prepare("SELECT payload FROM sync_events WHERE user_id = ? AND type = 'answer' ORDER BY seq DESC").iterate(user.id);
      for (const row of rows) {
        const { result, day } = JSON.parse(row.payload);
        if (game && result.gameId !== game) continue;
        for (const m of answerMistakes(result)) {
          kinds[m.kind] = (kinds[m.kind] || 0) + 1;
          byGame[result.gameId] = (byGame[result.gameId] || 0) + 1;
          if (recent.length < limit) recent.push({ day, game: result.gameId, word: result.word || "", given: m.given, kind: m.kind });
        }
      }
      return {
        kinds,
        games: Object.entries(byGame)
          .sort((a, b) => b[1] - a[1])
          .map(([id, mistakes]) => ({ ...gameInfo(id, user.lang, config.publicUrl), mistakes })),
        recent,
      };
    },
  },
  {
    name: "analyze_my_learning",
    title: "What Lingo makes of my learning",
    description:
      "Lingo's own reading of the learner's answers, the same as on their Profile page: a level per skill (starting, building, confident, strong, from the share of first-try answers; a skill needs 8 answers), what is going well and what is worth practising (skills and lessons, slow or often missed), the suggested difficulty, the last 7 days, the 10 trickiest words, the 3 most common kinds of mistake, and suggested practice: this week's My path, and a game for each skill worth practising, with links.",
    inputSchema: NO_ARGS,
    annotations: READ,
    run(args, { db, config, token }) {
      const { user, state } = learner(db, token);
      if (!user) return { error: "This account no longer exists." };
      if (!state) return empty(user);
      const base = config.publicUrl;
      const lang = user.lang;
      const insights = buildInsights(state, { games: GAME_LIST });
      const named = (c) => {
        if (c.kind === "lesson") {
          const [gameId, lesson] = c.id.split(/:(.*)/s);
          return { kind: "lesson", lesson, ...gameInfo(gameId, lang, base), firstTryShare: round2(c.score), ...(c.reason ? { reason: c.reason } : {}) };
        }
        return { kind: c.kind, id: c.id, firstTryShare: round2(c.score), ...(c.reason ? { reason: c.reason } : {}) };
      };
      const tricky = wordRows(state)
        .filter((w) => w.standing === "tricky")
        .sort((a, b) => b.lost - a.lost)
        .slice(0, 10)
        .map(({ word, solved, lost, recent }) => ({ word, solved, lost, recent }));
      const mistakeKinds = {};
      for (const row of db.prepare("SELECT payload FROM sync_events WHERE user_id = ? AND type = 'answer' ORDER BY seq DESC LIMIT 500").iterate(user.id)) {
        for (const m of answerMistakes(JSON.parse(row.payload).result)) mistakeKinds[m.kind] = (mistakeKinds[m.kind] || 0) + 1;
      }
      // A game for each skill worth practising: the one played least.
      const playable = GAME_LIST.filter((g) => !g.featured && !g.noPath && !g.soon);
      const played = (id) => state.stats?.games?.[id]?.n || 0;
      const practice = insights.toPractise
        .filter((c) => c.kind === "skill")
        .map((c) => {
          const g = playable.filter((x) => x.skill === c.id).sort((a, b) => played(a.id) - played(b.id))[0];
          return g ? { skill: c.id, ...gameInfo(g.id, lang, base) } : null;
        })
        .filter(Boolean);
      return {
        answered: insights.answered,
        enoughForLevels: insights.answered >= MIN_ANSWERS,
        overall: insights.overall ? { level: LEVEL_NAMES[insights.overall.level - 1], firstTryShare: round2(insights.overall.firstTryRate) } : null,
        skills: insights.skills.map((s) => ({
          skill: s.id,
          answers: s.n,
          firstTryShare: round2(s.firstTryRate),
          level: s.level ? LEVEL_NAMES[s.level - 1] : null,
          secondsPerAnswer: s.meanMs ? Math.round(s.meanMs / 100) / 10 : null,
        })),
        goingWell: insights.goingWell.map(named),
        worthPractising: insights.toPractise.map(named),
        suggestedDifficulty: insights.suggestedDifficulty,
        last7Days: insights.days.map((d) => ({ day: d.day, words: d.words, firstTry: d.firstTry })),
        trickiestWords: tricky,
        commonMistakeKinds: Object.entries(mistakeKinds)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([kind, n]) => ({ kind, n })),
        suggestedPractice: { myPath: myPath(db, user.id, state, insights, lang, base), bySkill: practice, quickPlay: gameInfo("quick-play", lang, base) },
      };
    },
  },
  {
    name: "get_my_leaderboard",
    title: "My weekly leaderboard",
    description:
      "The learner's weekly leaderboard, if they joined it under Account: their nickname, XP this week (Monday to Sunday, Finnish time), rank and the top of their group. Others appear only by their random nicknames.",
    inputSchema: NO_ARGS,
    annotations: READ,
    run(args, { db, token }) {
      return boardFor(db, token.user_id);
    },
  },
];

const text = (t) => [{ role: "user", content: { type: "text", text: t } }];

export const prompts = [
  {
    name: "review_my_progress",
    title: "How am I doing?",
    description: "A friendly look at your progress: what is going well, what to practise next, and how your week went.",
    arguments: [],
    messages: () =>
      text(`Look at how I'm doing in Lingo: get_my_overview, then analyze_my_learning. Tell me in a few short paragraphs, in my app language:
1. What has gone well lately (with numbers: streak, words learned, skills going well).
2. The one or two things most worth practising, and why, with the games to play for them (names and links).
3. How this week's My path is going.
Keep it encouraging and short.`),
  },
  {
    name: "practice_plan",
    title: "Plan my practice",
    description: "A short practice plan for the coming days from your tricky words, mistakes and skills.",
    arguments: [{ name: "minutes", description: "Minutes a day you have for practice (optional)." }],
    messages: ({ minutes }) =>
      text(`Make me a short practice plan for the next few days in Lingo${minutes ? `, about ${String(minutes).slice(0, 10)} minutes a day` : ""}.
Read get_my_overview, analyze_my_learning, get_my_words (tricky) and get_my_mistakes first. Then, in my app language, for each day name the games to play (with links) and why, mention a few of my tricky words and how my mistakes with them tend to go, and give one small tip for the kind of mistake I make most. Build on My path rather than replacing it.`),
  },
  {
    name: "explain_my_mistakes",
    title: "Explain my mistakes",
    description: "Go through your latest wrong answers and explain what tripped you up.",
    arguments: [{ name: "game", description: "Only this game's mistakes (optional)." }],
    messages: ({ game }) =>
      text(`Go through my latest mistakes in Lingo${game ? ` in the game "${String(game).slice(0, 40)}"` : ""} (get_my_mistakes). Group them by what went wrong (for example a sound Finnish doesn't have, a silent letter, word order, two words that look alike), explain each group simply in my app language with the right answer and a way to remember it, and finish with which game to practise them in.`),
  },
];
