import { useEffect, useState } from "react";
import { installWay, onInstallChange } from "./install";

// The current install way (src/lib/install.js), updated when the browser
// offers or finishes installing.
export function useInstallWay() {
  const [way, setWay] = useState(installWay);
  useEffect(() => onInstallChange(() => setWay(installWay())), []);
  return way;
}
