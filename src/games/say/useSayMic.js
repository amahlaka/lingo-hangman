import { useCallback, useEffect, useRef, useState } from "react";
import { canRecognise, installOnDevice, onDeviceStatus } from "../../lib/speechRecognition";
import { getPreferences, onPreferencesChange } from "../../lib/preferences";

// Wait this long for an on-device language pack before using the browser's
// online recognition for this attempt instead (Auto only).
const INSTALL_WAIT_MS = 15000;

function privacyFrom(status) {
  if (status === "available") return "local";
  if (status === "downloadable" || status === "downloading") return "downloadable";
  return "online";
}

// The microphone state for Say it questions, shared by Say it and Quick play:
// whether the browser can listen (else `selfReason` says why the learner checks
// themselves), where recognition runs (`privacy`) and the props SayQuestion needs.
// The learner picks where recognition runs in Practice settings
// (`recognition` in src/lib/preferences.js); Auto is Arttu's rule: on the
// device when it works, else the browser's online service.
export default function useSayMic(learningLang, p) {
  const [choice, setChoice] = useState(() => getPreferences().recognition);
  // null while the browser can listen; a reason when the learner checks themselves.
  const [selfReason, setSelfReason] = useState(() => (canRecognise() ? null : "unsupported"));
  const [privacy, setPrivacy] = useState("online");
  const install = useRef(null);

  useEffect(() => onPreferencesChange((prefs) => setChoice(prefs.recognition)), []);

  // A new choice starts over: the on-device check, and a self check that only
  // came from on-device recognition being unavailable.
  useEffect(() => {
    install.current = null;
    setSelfReason((r) => (r === "no-local" ? null : r));
  }, [choice, learningLang]);

  useEffect(() => {
    if (selfReason) return undefined;
    if (choice === "online") {
      setPrivacy("online");
      return undefined;
    }
    // On-device only never listens online, even before the check below is back.
    if (choice === "local") setPrivacy("downloadable");
    let live = true;
    onDeviceStatus(learningLang).then((status) => {
      if (!live) return;
      const where = privacyFrom(status);
      if (choice === "local" && where === "online") setSelfReason("no-local");
      else setPrivacy(where);
    });
    return () => {
      live = false;
    };
  }, [learningLang, selfReason, choice]);

  // Download the on-device language pack once; resolves true when it is ready.
  // With on-device only, waits for it, and resolves null (and switches to the
  // self check) when it can't be had.
  const prepareOnDevice = useCallback(() => {
    if (!install.current) {
      install.current = installOnDevice(learningLang).then((ok) => {
        if (ok) setPrivacy("local");
        else if (choice === "local") setSelfReason("no-local");
        else setPrivacy("online");
        return ok;
      });
    }
    if (choice === "local") return install.current.then((ok) => (ok ? true : null));
    const timeout = new Promise((resolve) => setTimeout(() => resolve(false), INSTALL_WAIT_MS));
    return Promise.race([install.current, timeout]);
  }, [learningLang, choice]);

  // On-device recognition failed although the browser offered it. Auto uses
  // the online service from now on; on-device only switches to the self
  // check. Returns whether to try again online.
  const onDeviceFailed = useCallback(
    (error) => {
      if (typeof console !== "undefined") console.warn(`On-device speech recognition failed (${error}).`);
      install.current = Promise.resolve(false);
      if (choice === "local") {
        setSelfReason("no-local");
        return false;
      }
      setPrivacy("online");
      return true;
    },
    [choice]
  );

  const selfNote =
    selfReason === "unsupported"
      ? p.saySelfUnsupported
      : ["not-allowed", "service-not-allowed", "audio-capture"].includes(selfReason)
        ? p.saySelfMicBlocked
        : selfReason === "no-local"
          ? p.saySelfNoLocal
          : selfReason
            ? p.saySelfNoService
            : null;

  return { selfReason, setSelfReason, privacy, onDeviceOnly: choice === "local", prepareOnDevice, onDeviceFailed, selfNote };
}
