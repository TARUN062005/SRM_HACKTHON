/* global importScripts */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

const loadFirebaseConfig = async () => {
  try {
    const res = await fetch('/api/config/firebase');
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
};

const initMessaging = async () => {
  const firebaseConfig = await loadFirebaseConfig();
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    console.warn('[firebase-messaging-sw] Firebase config missing; push disabled.');
    return;
  }

  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    console.log("[firebase-messaging-sw.js] Background message received");

    const title = payload?.notification?.title || "New Notification";
    const options = {
      body: payload?.notification?.body || "",
      icon: "/favicon.ico",
    };

    self.registration.showNotification(title, options);
  });
};

initMessaging();
