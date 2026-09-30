import { VAPID_PUBLIC_KEY } from "./config";
import { apiFetch } from "./client";

// Web Push for the daily reading reminder. The browser side is entirely
// standard: register the service worker (public/sw.js), subscribe through
// PushManager, and hand the subscription to the backend. The VAPID public
// key must match the backend's private key.
export { VAPID_PUBLIC_KEY };

export function notificationsSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Registers the service worker (idempotent, safe to call on every load).
// Returns the registration, or null when unsupported or registration fails.
export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.warn("service worker registration failed", err);
    return null;
  }
}

// The PushManager applicationServerKey wants raw bytes, but the VAPID key
// is base64url text.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

// This browser's current subscription, or null when it is not subscribed.
export async function getSubscription() {
  if (!notificationsSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// Asks for notification permission, subscribes this browser, and stores
// the subscription on the backend. Throws a user-facing message on any
// failure so the profile screen can show it.
export async function subscribeToReminders() {
  if (!notificationsSupported()) {
    throw new Error("reminders are not supported on this device");
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error("reminders are not configured yet");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("notifications were blocked for this site");
  }

  await registerServiceWorker();
  const registration = await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const res = await apiFetch("/api/notifications/subscribe", {
    method: "POST",
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) throw new Error("could not save your reminder settings");

  return subscription;
}

// Unsubscribes this browser and removes the subscription from the
// backend. The local unsubscribe always runs even if the backend call
// fails, so reminders actually stop on this device.
export async function unsubscribeFromReminders() {
  const subscription = await getSubscription();
  if (!subscription) return;

  try {
    await apiFetch("/api/notifications/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } catch (err) {
    console.warn("could not remove the subscription from the backend", err);
  }

  await subscription.unsubscribe();
}
