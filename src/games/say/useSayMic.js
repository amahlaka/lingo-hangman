import { useCallback, useEffect, useRef, useState } from "react";
import { canRecognise, installOnDevice, onDeviceStatus } from "../../lib/speechRecognition";

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
// themselves), where recognition runs (`privacy`) and the props SayQuestion needs.
export default function useSayMic(learningLang, p) {
  // null while the browser can listen; a reason when the learner checks themselves.
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

  return { selfReason, setSelfReason, privacy, prepareOnDevice, onDeviceFailed, selfNote };
}
