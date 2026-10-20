import { useCallback, useEffect, useRef, useState } from "react";
import { canRecognise, installOnDevice, onDeviceStatus } from "../../lib/speechRecognition";
import { serverSpeechReady } from "../../lib/serverSpeech";

// Wait this long for an on-device language pack before using the browser's
// online recognition for this attempt instead.
const INSTALL_WAIT_MS = 15000;

function privacyFrom(status) {
  if (status === "available") return "local";
  if (status === "downloadable" || status === "downloading") return "downloadable";
  return "online";
}

// The microphone state for Say it questions, shared by Say it and Quick play:
// whether the browser can listen (else `selfReason` says why the learner checks
// themselves), where recognition runs (`privacy`: "local", "downloadable",
// "online", or "server" for Lingo's own recogniser, which verified learners
// can turn on) and the props SayQuestion needs.
export default function useSayMic(learningLang, p) {
  // null while the browser can listen; a reason when the learner checks themselves.
  const [selfReason, setSelfReason] = useState(() => (canRecognise() ? null : "unsupported"));
  const [privacy, setPrivacy] = useState("online");
  const install = useRef(null);
  // Lingo's own recogniser (src/lib/serverSpeech.js); it records the clip
  // itself, so it also works where the browser has no speech recognition.
  const [server, setServer] = useState(false);

  useEffect(() => {
    let live = true;
    serverSpeechReady().then((on) => {
      if (!live || !on) return;
      setServer(true);
      setSelfReason((reason) => (reason === "unsupported" ? null : reason));
    });
    return () => {
      live = false;
    };
  }, []);

  // Lingo's recogniser couldn't answer (limit reached, busy, offline): the
  // browser listens for the rest of the round, or the learner checks themselves.
  const serverFailed = useCallback((error) => {
    if (typeof console !== "undefined") console.warn(`Lingo's speech recogniser failed (${error}); using the browser's.`);
    setServer(false);
    setSelfReason((reason) => reason || (canRecognise() ? null : "unsupported"));
  }, []);

  useEffect(() => {
    if (selfReason || !canRecognise()) return undefined;
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

  // On-device recognition failed although the browser offered it: use the
  // online service from now on (Arttu's rule: on-device when it works, else online).
  const onDeviceFailed = useCallback((error) => {
    if (typeof console !== "undefined") console.warn(`On-device speech recognition failed (${error}); using the browser's online service.`);
    install.current = Promise.resolve(false);
    setPrivacy("online");
  }, []);

  const selfNote =
    selfReason === "unsupported"
      ? p.saySelfUnsupported
      : ["not-allowed", "service-not-allowed", "audio-capture"].includes(selfReason)
        ? p.saySelfMicBlocked
        : selfReason
          ? p.saySelfNoService
          : null;

  return { selfReason, setSelfReason, privacy: server ? "server" : privacy, prepareOnDevice, onDeviceFailed, serverFailed, selfNote };
}
