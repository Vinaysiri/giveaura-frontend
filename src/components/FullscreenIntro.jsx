import { useEffect, useRef } from "react";
import GiveAuraLogo from "../assets/GiveAuraLogo.webm";
import "./FullscreenIntro.css";

export default function FullscreenIntro({ onFinish }) {
  const videoRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";

    const v = videoRef.current;
    if (v) {
      v.play().catch(() => {});
      v.onended = () => {
        document.body.style.overflow = "";
        onFinish();
      };
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [onFinish]);

  return (
    <div className="intro-overlay">
      <video
        ref={videoRef}
        className="intro-video"
        src={GiveAuraLogo}
        muted
        playsInline
        preload="auto"
      />
    </div>
  );
}
