import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { canRecognise, installOnDevice, onDeviceStatus } from "../../lib/speechRecognition";
import PracticeSession from "../practice/PracticeSession";
import { buildRound, practicePool, wordCount } from "../practice/practiceLogic";
import { MAX_SAY_WORDS, SAY_ROUND_LENGTH } from "./sayLogic";
import SayQuestion from "./SayQuestion";

// Wait this long for an on-device language pack before using the browser's
// online recognition for this attempt instead.
const INSTALL_WAIT_MS = 15000;

const SAY_KEYS = {
  correctTitle: "sayCorrectTitle",
  correctFirstTry: "sayCorrectFirstTry",
  correctLater: "sayCorrectLater",
  retryTitle: "sayRetryTitle",
};

function privacyFrom(status) {
  if (status === "available") return "local";
  if (status === "downloadable" || status === "downloading") return "downloadable";
  return "online";
}

// See an English word, hear it, then say it into the microphone.
export default function SayGame() {
  const [params] = useSearchParams();
  const { t } = useSettings();
  const p = t.practice;
  const search = params.toString();
  const { pairs, learningLang, nativeLang } = useMemo(() => {
    const pool = practicePool(new URLSearchParams(search));
    return { ...pool, pairs: pool.pairs.filter((w) => wordCount(w.learning) <= MAX_SAY_WORDS) };
  }, [search]);

  // "mic" while the browser can listen; "self" when the learner checks themselves.
  const [selfReason, setSelfReason] = useState(() => (canRecognise() ? null : "unsupported"));
  const [privacy, setPrivacy] = useState("online");
  const install = useRef(null);

  useEffect(() => {
    if (selfReason) return undefined;
    let live = true;
    onDeviceStatus(learningLang).then((status) => live && setPrivacy(privacyFrom(status)));
    return () => {
      live = false;
    };
  }, [learningLang, selfReason]);

  // Download the on-device language pack once; resolves true when it is ready.
  const prepareOnDevice = useCallback(() => {
    if (!install.current) {
      install.current = installOnDevice(learningLang).then((ok) => {
        setPrivacy(ok ? "local" : "online");
        return ok;
      });
    }
    const timeout = new Promise((resolve) => setTimeout(() => resolve(false), INSTALL_WAIT_MS));
    return Promise.race([install.current, timeout]);
  }, [learningLang]);

  const selfNote =
    selfReason === "unsupported"
      ? p.saySelfUnsupported
      : ["not-allowed", "service-not-allowed", "audio-capture"].includes(selfReason)
        ? p.saySelfMicBlocked
        : selfReason
          ? p.saySelfNoService
          : null;

  return (
    <PracticeSession
      gameId="say"
      title={p.sayName}
      intro={selfReason ? p.sayIntroSelf : p.sayIntro}
      learningLang={learningLang}
      nativeLang={nativeLang}
      meaningInFeedback={false}
      keys={SAY_KEYS}
      buildQuestions={() => buildRound(pairs, SAY_ROUND_LENGTH)}
      renderQuestion={({ question, done, onDone }) => (
        <SayQuestion
          word={question}
          learningLang={learningLang}
          nativeLang={nativeLang}
          done={done}
          onDone={onDone}
          p={p}
          mode={selfReason ? "self" : "mic"}
          selfNote={selfNote}
          privacy={privacy}
          prepareOnDevice={prepareOnDevice}
          onBlocked={setSelfReason}
        />
      )}
    />
  );
}
