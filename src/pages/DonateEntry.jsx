import React, { useEffect, useState } from "react";
import Donate from "./Donate";
import DonateMobile from "./DonateMobile";

export default function DonateEntry() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isMobile ? <DonateMobile /> : <Donate />;
}
