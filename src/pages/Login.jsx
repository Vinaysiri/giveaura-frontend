// src/pages/Login.jsx
import { useState, useEffect } from "react";
import { auth } from "../firebase";
import { handleReferralOnSignup } from "../services/referralService";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { useNavigate, useLocation } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const provider = new GoogleAuthProvider();
  const from = location.state?.from?.pathname || "/";

  //  Capture referral code from URL (once)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) localStorage.setItem("referralCode", ref);
  }, []);

  // 🔹 Email/Password login or register
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      if (isRegister) {
        // client-side validations
        if (!email || !password || !confirmPassword) {
          setErrorMsg("Please fill all fields.");
          return;
        }
        if (password !== confirmPassword) {
          setErrorMsg("Passwords do not match.");
          return;
        }
        if (password.length < 6) {
          setErrorMsg("Password must be at least 6 characters.");
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        //  Track referral after successful signup
        await handleReferralOnSignup(userCredential.user.uid);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }

      navigate(from, { replace: true });
    } catch (error) {
      console.error("Auth error:", error);
      if (error?.code === "auth/email-already-in-use")
        setErrorMsg("This email is already in use. Try logging in.");
      else if (error?.code === "auth/invalid-email")
        setErrorMsg("Invalid email address.");
      else if (error?.code === "auth/wrong-password")
        setErrorMsg("Incorrect password.");
      else setErrorMsg(error.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Google Sign-In
  const handleGoogleSignIn = async () => {
    setErrorMsg("");
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);

      //  Track referral for Google signup as well
      await handleReferralOnSignup(result.user.uid);

      navigate(from, { replace: true });
    } catch (error) {
      console.error("Google Sign-In Error:", error);
      if (error.code === "auth/account-exists-with-different-credential") {
        setErrorMsg(
          "An account with this email already exists using a different sign-in method. Please use that method to log in."
        );
      } else {
        setErrorMsg(error.message || "Google Sign-In failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        textAlign: "center",
        marginTop: "60px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <h2 style={{ marginBottom: "20px", color: "#222" }}>
        {isRegister ? "Create Account" : "Welcome Back"}
      </h2>

      {/* Email / Password Form */}
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          padding: "25px 30px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          width: "320px",
          marginBottom: "15px",
        }}
      >
        {errorMsg && (
          <div
            role="alert"
            style={{
              marginBottom: 10,
              color: "#b91c1c",
              background: "#fff1f2",
              padding: "8px 10px",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            {errorMsg}
          </div>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-label="Email"
          style={{
            width: "100%",
            padding: "10px",
            marginBottom: "10px",
            borderRadius: "6px",
            border: "1px solid #ccc",
            fontSize: "15px",
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          aria-label="Password"
          style={{
            width: "100%",
            padding: "10px",
            marginBottom: isRegister ? "10px" : "12px",
            borderRadius: "6px",
            border: "1px solid #ccc",
            fontSize: "15px",
          }}
        />

        {isRegister && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            aria-label="Confirm password"
            style={{
              width: "100%",
              padding: "10px",
              marginBottom: "12px",
              borderRadius: "6px",
              border: "1px solid #ccc",
              fontSize: "15px",
            }}
          />
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "10px",
            backgroundColor: "#0069ff",
            color: "#fff",
            fontWeight: "600",
            borderRadius: "6px",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "15px",
          }}
        >
          {loading ? "Please wait..." : isRegister ? "Register" : "Login"}
        </button>
      </form>

      {/* Divider */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "320px",
          margin: "10px 0",
        }}
      >
        <div style={{ flex: 1, height: "1px", backgroundColor: "#ccc" }} />
        <span style={{ margin: "0 10px", color: "#666", fontSize: "13px" }}>
          or
        </span>
        <div style={{ flex: 1, height: "1px", backgroundColor: "#ccc" }} />
      </div>

      {/* Google Sign-In */}
      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fff",
          border: "1px solid #ccc",
          borderRadius: "6px",
          padding: "10px 16px",
          width: "320px",
          cursor: loading ? "not-allowed" : "pointer",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          fontWeight: "500",
          fontSize: "15px",
        }}
      >
        <img
          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt="Google Logo"
          style={{ width: "20px", height: "20px", marginRight: "10px" }}
        />
        {loading ? "Signing in..." : "Sign in with Google"}
      </button>

      {/* Toggle */}
      <p
        onClick={() => {
          setIsRegister((s) => !s);
          setErrorMsg("");
          setConfirmPassword("");
        }}
        style={{
          cursor: "pointer",
          color: "#0069ff",
          marginTop: "15px",
          fontSize: "14px",
        }}
      >
        {isRegister
          ? "Already have an account? Login"
          : "No account yet? Register"}
      </p>

      <p
        style={{
          fontSize: "12px",
          color: "#888",
          marginTop: "10px",
          width: "320px",
          lineHeight: "1.4",
        }}
      >
        Make sure Google Sign-In is enabled in{" "}
        <b>Firebase Console → Authentication → Sign-in method → Google.</b>
      </p>
    </div>
  );
}
