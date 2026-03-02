// src/hooks/usePlatformConfig.js
import { useEffect, useState, useRef } from "react";
import { getPlatformConfig, subscribePlatformConfig } from "../services/firestoreService";

export default function usePlatformConfig({ live = true } = {}) {
  const mountedRef = useRef(true);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    mountedRef.current = true;

    const load = async () => {
      setLoading(true);
      try {
        const cfg = await getPlatformConfig();
        if (!mountedRef.current) return;
        setConfig(cfg || null);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    load();

    let unsub;
    if (live) {
      try {
        unsub = subscribePlatformConfig((d, e) => {
          if (!mountedRef.current) return;
          if (e) setError(e);
          else setConfig(d || null);
        });
      } catch (err) {
        console.warn("subscribePlatformConfig failed:", err);
      }
    }

    return () => {
      mountedRef.current = false;
      if (typeof unsub === "function") unsub();
    };
  }, [live]);

  return { config, loading, error, refresh: async () => {
    try {
      setLoading(true);
      const cfg = await getPlatformConfig();
      setConfig(cfg);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }};
}
