const RAZORPAY_SCRIPT_SRC =
  "https://checkout.razorpay.com/v1/checkout.js";

let razorpayPromise = null;

export function preloadRazorpay() {
  if (typeof window === "undefined") return;

  if (window.Razorpay) return Promise.resolve(true);

  if (razorpayPromise) return razorpayPromise;

  razorpayPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${RAZORPAY_SCRIPT_SRC}"]`
    );

    if (existing) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () =>
      reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  });

  return razorpayPromise;
}