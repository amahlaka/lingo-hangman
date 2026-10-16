// Sends one push message with the server's VAPID keys (web-push handles the
// signing and the payload encryption). Tests pass their own `send`.

import webpush from "web-push";

export function pushConfigured(config) {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey);
}

export function createPushSender(config) {
  if (!pushConfigured(config)) return null;
  const vapidDetails = { subject: config.vapidSubject, publicKey: config.vapidPublicKey, privateKey: config.vapidPrivateKey };
  return (sub, message) =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message), {
      vapidDetails,
      // A reminder not delivered within a few hours isn't worth showing, and
      // a newer one replaces one still waiting.
      TTL: 4 * 3600,
      topic: "reminder",
      urgency: "normal",
      timeout: 15000,
    });
}
