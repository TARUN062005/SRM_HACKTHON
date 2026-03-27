/* global importScripts */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyB-hUvBSZDDv2WAE_LQLkMrp3xowlhYzbc",
  authDomain: "fir-91b17.firebaseapp.com",
  projectId: "fir-91b17",
  storageBucket: "fir-91b17.firebasestorage.app",
  messagingSenderId: "800838376180",
  appId: "1:800838376180:web:b5df429b6e99a9f1349ca1",
  measurementId: "G-ZCXXSB44LN"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Background message received");

  const title = payload?.notification?.title || "New Notification";
  const options = {
    body: payload?.notification?.body || "",
    icon: "/favicon.ico"
  };

  self.registration.showNotification(title, options);
});
