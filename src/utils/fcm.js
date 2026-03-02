import { getMessaging, getToken } from "firebase/messaging";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export async function registerFCMToken(user) {
  try {
    if (!user) return;

    console.log(" Registering FCM for", user.uid);

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn(" Notification permission denied");
      return;
    }

    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: "BLqLpLWGNqvf1vvGLd1dwwHm6Dtzlq2j2Hak2dWKrywKokVk60g2AcwHMrfe_IziPj4gjsiNV9w1cCeYDMA1FYU",
    });


    if (!token) {
      console.error(" FCM token is null");
      return;
    }

    await updateDoc(doc(db, "users", user.uid), {
      fcmToken: token,
      fcmUpdatedAt: new Date(),
    });

    console.log(" FCM token saved to Firestore");
  } catch (err) {
    console.error(" registerFCMToken error", err);
  }
}
