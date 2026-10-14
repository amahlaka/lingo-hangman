import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { canRecognise, installOnDevice, onDeviceStatus } from "../../lib/speechRecognition";
import { debugListenLang, logMicEvent, useMicDebug } from "../../lib/micDebug";
import MicDebugPanel from "./MicDebugPanel";
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
  const [status, setStatus] = useState("unknown");
  const install = useRef(null);

  // Mic debug mode (Practice settings) can change the listening language and
  // force how speech is detected; otherwise the normal rule applies.
  const debug = useMicDebug();
  const listenLang = debugListenLang(debug, learningLang);
  const detection = debug.on ? debug.detection : "auto";

  useEffect(() => {
    if (selfReason) return undefined;
    let live = true;
    install.current = null;
    onDeviceStatus(listenLang).then((s) => {
      if (!live) return;
      setStatus(s);
      setPrivacy(privacyFrom(s));
    });
    return () => {
      live = false;
    };
  }, [listenLang, selfReason]);

  // Download the on-device language pack once; resolves true when it is ready.
  const prepareOnDevice = useCallback(() => {
    if (!install.current) {
      install.current = installOnDevice(listenLang).then((ok) => {
        setPrivacy(ok ? "local" : "online");
        if (ok) setStatus("available");
        return ok;
      });
    }
    const timeout = new Promise((resolve) => setTimeout(() => resolve(false), INSTALL_WAIT_MS));
    return Promise.race([install.current, timeout]);
  }, [listenLang]);

  // On-device recognition failed although the browser offered it: use the
  // online service from now on (Arttu's rule: on-device when it works, else online).
  const onDeviceFailed = useCallback((error) => {
    if (typeof console !== "undefined") console.warn(`On-device speech recognition failed (${error}); using the browser's online service.`);
    install.current = Promise.resolve(false);
    setPrivacy("online");
  }, []);

  const mode = selfReason || detection === "self" ? "self" : "mic";
  const usedPrivacy = detection === "local" ? "local" : detection === "online" ? "online" : privacy;
  const inUse = mode === "self" ? "self check" : usedPrivacy === "local" ? "on device" : usedPrivacy === "downloadable" ? "on device after download" : "online";

  const selfNote =
    !selfReason && detection === "self"
      ? "Self check (mic debug mode)."
      : selfReason === "unsupported"
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
      intro={mode === "self" ? p.sayIntroSelf : p.sayIntro}
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
          mode={mode}
          selfNote={selfNote}
          privacy={usedPrivacy}
          prepareOnDevice={prepareOnDevice}
          onBlocked={setSelfReason}
          onOnDeviceFailed={onDeviceFailed}
          listenLang={listenLang}
          fallback={detection === "auto"}
          onEvent={debug.on ? logMicEvent : undefined}
        />
      )}
      boardExtra={
        debug.on ? (
          <MicDebugPanel
            settings={debug}
            learningLang={learningLang}
            listenLang={listenLang}
            status={status}
            inUse={inUse}
            selfReason={selfReason}
            onRetryMic={() => setSelfReason(canRecognise() ? null : "unsupported")}
            onInstall={() => {
              install.current = null;
              return prepareOnDevice();
            }}
          />
        ) : null
      }
    />
  );
}
