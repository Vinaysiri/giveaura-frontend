// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, getIdTokenResult } from "firebase/auth";
import { auth } from "../firebase";
import { saveUserProfile, getUserProfile } from "../services/firestoreService";
import { registerFCMToken } from "../utils/fcm";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

/* ---------- Admin Check ---------- */
async function checkAdmin(currentUser) {
  try {
    if (!currentUser) return false;
    const tokenResult = await getIdTokenResult(currentUser);
    return tokenResult.claims?.admin === true;
  } catch (err) {
    console.error("getIdTokenResult failed (admin detect):", err);
    return false;
  }
}

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ---------- Merge Auth + Backend Profile ---------- */
  const buildMergedUser = async (authUser) => {
    if (!authUser) return null;

    try {
      const profile = await getUserProfile(authUser.uid);
      const p = profile || {};

      const displayName =
        (p.displayName && String(p.displayName).trim()) ||
        authUser.displayName ||
        (authUser.email ? authUser.email.split("@")[0] : "User");

      const photoURL =
        p.photoURL ||
        authUser.photoURL ||
        "/default-avatar.png";

      return {
        uid: authUser.uid,
        email: authUser.email,
        displayName,
        photoURL,
        bio: p.bio || "",
        phoneNumber:
          p.phone || p.phoneNumber || authUser.phoneNumber || null,
        bank: p.bank || null,
        publicProfile:
          typeof p.publicProfile === "boolean" ? p.publicProfile : false,
        auth: authUser,
        rawProfile: p,
      };
    } catch (err) {
      console.warn(
        "⚠️ buildMergedUser failed, falling back to auth-only:",
        err
      );

      return {
        uid: authUser.uid,
        email: authUser.email,
        displayName:
          authUser.displayName ||
          (authUser.email ? authUser.email.split("@")[0] : "User"),
        photoURL: authUser.photoURL || "/default-avatar.png",
        bio: "",
        phoneNumber: authUser.phoneNumber || null,
        bank: null,
        publicProfile: false,
        auth: authUser,
      };
    }
  };

  /* ---------- Auth State Listener ---------- */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);

      
      if (user) {
        // 1️⃣ Build merged user
        const mergedUser = await buildMergedUser(user);
        setCurrentUser(mergedUser);

        // 2️⃣ Ensure user document exists (non-fatal)
        try {
          await saveUserProfile(user.uid, {
            displayName: mergedUser.displayName,
            photoURL: mergedUser.photoURL,
          });
        } catch (err) {
          console.warn("saveUserProfile failed (non-fatal):", err);
        }

        // 3️⃣ Register FCM token (CORRECT PLACE)
        registerFCMToken(user);

      } else {
        setCurrentUser(null);
      }

      setLoading(false);

    });

    

    return unsubscribe;
  }, []);

  /* ---------- Logout ---------- */
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
