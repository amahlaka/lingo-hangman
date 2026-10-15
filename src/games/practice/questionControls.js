import { createContext, useContext } from "react";

// Lets the question on screen tell PracticeSession how to skip it and what to
// add to a problem report. PracticeSession shows "Skip this one" and "Report a
// problem" under every question, so games don't each draw their own.
export const QuestionControls = createContext(null);

// Call on every render with { skip, reportExtra }:
//   skip()          ends the question unsolved with the answer shown, like
//                   running out of tries; without it, skipping just moves on
//   reportExtra()   returns extra report context, such as what the mic heard
export function useQuestionControls(controls) {
  const ref = useContext(QuestionControls);
  if (ref) ref.current = controls;
}
