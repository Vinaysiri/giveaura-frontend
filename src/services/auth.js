// src/services/auth.js
import { auth } from "../firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;


export const signUp = async (email, password) => {
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    const e = new Error("Email and password are required");
    e.code = "auth/invalid-arguments";
    throw e;
  }
  try {
    return await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {

    const e = new Error(err?.message || "Sign up failed");
    e.original = err;
    e.code = err?.code || "auth/signup-failed";
    throw e;
  }
};


export const signIn = async (email, password) => {
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    const e = new Error("Email and password are required");
    e.code = "auth/invalid-arguments";
    throw e;
  }
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    const e = new Error(err?.message || "Sign in failed");
    e.original = err;
    e.code = err?.code || "auth/signin-failed";
    throw e;
  }
};

export const logOut = async () => {
  try {
    return await signOut(auth);
  } catch (err) {
    const e = new Error(err?.message || "Sign out failed");
    e.original = err;
    e.code = err?.code || "auth/signout-failed";
    throw e;
  }
};
