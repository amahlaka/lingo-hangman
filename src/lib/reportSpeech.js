// Which spoken texts a learner's problem report is about, from what the
// question showed (the report's context). Shared by the Reports page
// (src/admin/AdminReports.jsx) and the API, which links reports to recorded
// clips for the Recordings page (server/src/lib/wordClips.js). No imports, so
// it runs in plain Node.

// The text the question said aloud: a sound lesson's word, else the answer.
export function spokenTextOf(context) {
  const q = context?.question;
  const word = q?.word;
  if (word && typeof word === "object") return word.speak || String(word.text || "").replace(/[[\]]/g, "");
  if (typeof context?.answer === "string") return context.answer;
  return q?.learning || q?.target?.learning || q?.text || "";
}

// Every text the question may have said: the one above, then the question's
// own English and an "answer:<text>" item ref. A report doesn't say which one
// was played (or in which voice), so a clip of any of them counts.
export function reportedTexts(context, itemRef = "") {
  const q = context?.question;
  const out = [spokenTextOf(context), q?.learning, q?.target?.learning, q?.text];
  if (typeof itemRef === "string" && itemRef.startsWith("answer:")) out.push(itemRef.slice(7));
  return [...new Set(out.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()))];
}
