/**
 * Firebase Admin SDK wrapper for FCM push notifications.
 * Initialization is lazy so the app still boots if Firebase is not configured.
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);

let _messaging = null;

function getMessaging() {
  if (_messaging) return _messaging;

  // Support two env variable styles:
  //   FIREBASE_SERVICE_ACCOUNT_PATH  – path to the JSON key file
  //   FIREBASE_SERVICE_ACCOUNT_JSON  – the JSON content as a string
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!keyPath && !keyJson) {
    console.warn("[Firebase] No service account configured (FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON). FCM pushes disabled.");
    return null;
  }

  try {
    const admin = require("firebase-admin");
    if (admin.apps.length === 0) {
      let credential;
      if (keyJson) {
        const serviceAccount = JSON.parse(keyJson);
        credential = admin.credential.cert(serviceAccount);
      } else {
        credential = admin.credential.cert(keyPath);
      }
      admin.initializeApp({ credential });
    }
    _messaging = admin.messaging();
    console.log("[Firebase] Admin SDK initialised — FCM ready");
    return _messaging;
  } catch (err) {
    console.error("[Firebase] Init failed:", err.message);
    return null;
  }
}

/**
 * Send an FCM push notification directly to a device FCM token.
 * @param {string} fcmToken  – The device FCM registration token
 * @param {string} title     – Notification title
 * @param {string} body      – Notification body
 * @param {object} data      – Optional key-value string payload
 */
export async function sendFCMPush(fcmToken, title, body, data = {}) {
  if (!fcmToken) return;
  const messaging = getMessaging();
  if (!messaging) return;

  // FCM data values must all be strings
  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = String(v);
  }

  try {
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      android: {
        notification: {
          sound: "default",
          channelId: "default",
          priority: "high",
        },
        priority: "high",
      },
      apns: {
        payload: {
          aps: { sound: "default", badge: 1 },
        },
      },
      data: stringData,
    });
  } catch (err) {
    // Non-fatal — log but don't crash request
    console.error("[Firebase] FCM send failed:", err.message);
  }
}
