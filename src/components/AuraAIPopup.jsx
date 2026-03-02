// src/components/AuraAIPopup.jsx
import React, { useEffect, useRef, useState } from "react";

export default function AuraAIPopup({ open, onClose, onApplyDraft }) {
  const QUESTIONS = [
    { key: "title", ask: "What is the campaign title?" },
    {
      key: "goal",
      ask:
        "How much money do you want to raise? Say the amount in rupees, for example fifty thousand.",
    },
    { key: "short", ask: "Give a short description of the need. Keep it brief." },
    {
      key: "tags",
      ask:
        "Any tags or keywords? Say them separated by commas; for example, medical, urgent.",
    },
    {
      key: "pitch",
      ask: "Finally, provide a short pitch sentence donors will read (one line).",
    },
  ];

  const LANG_OPTIONS = [
    { code: "en-IN", label: "English (India)" },
    { code: "hi-IN", label: "Hindi" },
    { code: "te-IN", label: "Telugu" },
    { code: "ta-IN", label: "Tamil" },
    { code: "mr-IN", label: "Marathi" },
    { code: "bn-IN", label: "Bengali" },
  ];

  // refs + state
  const dialogRef = useRef(null);
  const recognitionRef = useRef(null);
  const answersRef = useRef({});
  const flowAbortRef = useRef(false);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [banner, setBanner] = useState(null);

  const savedTts =
    typeof window !== "undefined" && localStorage.getItem("aura_tts_lang")
      ? localStorage.getItem("aura_tts_lang")
      : "en-IN";
  const savedStt =
    typeof window !== "undefined" && localStorage.getItem("aura_stt_lang")
      ? localStorage.getItem("aura_stt_lang")
      : "en-IN";

  const [ttsLang, setTtsLang] = useState(savedTts);
  const [sttLang, setSttLang] = useState(savedStt);

  // detect Web Speech support once
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;
    setRecognitionSupported(Boolean(SpeechRecognition));
  }, []);

  // responsive detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // open/close lifecycle + body scroll lock
  useEffect(() => {
    if (open) {
      try { document.body.style.overflow = "hidden"; } catch {}
      flowAbortRef.current = false;
      setCurrentIdx(0);
      answersRef.current = {};
      setLiveText("");
      setResult(null);
      setError(null);
      setMicBlocked(false);
      setLoading(false);
      setTimeout(() => dialogRef.current?.focus(), 120);
      window.dispatchEvent(new CustomEvent("aura:opened", { detail: { open: true } }));

      (async function openSequence() {
        try {
          stopRecognition();
          stopSpeech();
          await speakAsync("Hello — did you call me?", ttsLang);
          await new Promise((r) => setTimeout(r, 220));
          if (recognitionSupported) {
            startQuestionFlow().catch(() => setMicBlocked(true));
          } else {
            setError("Voice not supported in this browser. Please type your answers.");
          }
        } catch (e) {
          setMicBlocked(true);
        }
      })();
    } else {
      stopAll();
    }

    return () => {
      try { document.body.style.overflow = ""; } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      stopAll();
      try { document.body.style.overflow = ""; } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist language choices
  useEffect(() => {
    try { localStorage.setItem("aura_tts_lang", ttsLang); } catch {}
  }, [ttsLang]);
  useEffect(() => {
    try { localStorage.setItem("aura_stt_lang", sttLang); } catch {}
  }, [sttLang]);

  // --- TTS helpers ---
  function speakAsync(text, lang = ttsLang) {
    return new Promise((resolve) => {
      try {
        if (!("speechSynthesis" in window)) { resolve(); return; }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        try {
          const voices = window.speechSynthesis.getVoices() || [];
          const base = (lang || "").split("-")[0].toLowerCase();
          const match =
            voices.find((v) => v.lang ? v.lang.toLowerCase().startsWith(base) : false) ||
            voices.find((v) => v.lang ? v.lang.toLowerCase().startsWith((lang || "").toLowerCase()) : false);
          if (match) u.voice = match;
        } catch {}
        u.onend = () => setTimeout(resolve, 160);
        u.onerror = () => setTimeout(resolve, 160);
        window.speechSynthesis.speak(u);
      } catch {
        setTimeout(resolve, 160);
      }
    });
  }
  function stopSpeech() {
    try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch {}
  }

  // --- STT helpers ---
  function initRecognition(forLang = sttLang) {
    try {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition || null;
      if (!SpeechRecognition) return null;
      try {
        if (recognitionRef.current && typeof recognitionRef.current.abort === "function") {
          recognitionRef.current.abort();
        }
      } catch {}
      const rec = new SpeechRecognition();
      rec.lang = forLang || sttLang;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onstart = () => {
        setListening(true);
        setError(null);
        window.dispatchEvent(new CustomEvent("aura:recording", { detail: { recording: true } }));
      };
      rec.onend = () => {
        setListening(false);
        window.dispatchEvent(new CustomEvent("aura:recording", { detail: { recording: false } }));
      };
      rec.onerror = (ev) => {
        setListening(false);
        const msg = ev?.error || "Speech recognition error";
        setError(msg);
        window.dispatchEvent(new CustomEvent("aura:recording", { detail: { recording: false, error: msg } }));
      };
      recognitionRef.current = rec;
      return rec;
    } catch {
      return null;
    }
  }

  function listenOnce(timeoutMs = 15000, langOverride) {
    const effectiveLang = langOverride || sttLang;
    return new Promise((resolve, reject) => {
      const rec = initRecognition(effectiveLang);
      if (!rec) { reject(new Error("SpeechRecognition not supported")); return; }

      let finalText = "";
      let resolved = false;
      let timer = null;

      function onResult(ev) {
        let interim = "";
        let finals = [];
        for (let i = 0; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finals.push(r[0].transcript.trim());
          else interim += (r[0].transcript || "").trim() + " ";
        }
        if (finals.length > 0) {
          finalText = finals.join(" ").trim();
          setLiveText(finalText);
        } else {
          const interimText = interim.trim();
          setLiveText((prev) => (prev ? prev + " " + interimText : interimText));
        }
      }

      function onEnd() {
        cleanup();
        resolved = true;
        resolve(finalText.trim());
      }

      function onError(ev) {
        cleanup();
        const err = new Error(ev?.error || "Recognition error");
        reject(err);
      }

      function cleanup() {
        try { rec.onresult = null; rec.onend = null; rec.onerror = null; } catch {}
        if (timer) { clearTimeout(timer); timer = null; }
      }

      rec.onresult = onResult;
      rec.onend = onEnd;
      rec.onerror = onError;

      try {
        rec.start();
      } catch (e) {
        cleanup();
        reject(e);
        return;
      }

      timer = setTimeout(() => {
        try {
          if (!resolved) {
            try { rec.stop(); } catch {}
            cleanup();
            resolve(finalText.trim());
          }
        } catch {}
      }, timeoutMs);
    });
  }

  function stopRecognition() {
    try {
      const r = recognitionRef.current;
      if (r && typeof r.stop === "function") r.stop();
    } catch {}
    try { recognitionRef.current = null; } catch {}
    setListening(false);
  }

  function stopAll() {
    flowAbortRef.current = true;
    stopRecognition();
    stopSpeech();
    window.dispatchEvent(new CustomEvent("aura:recording", { detail: { recording: false } }));
    window.dispatchEvent(new CustomEvent("aura:opened", { detail: { open: false } }));
    answersRef.current = {};
    setLiveText("");
    setMicBlocked(false);
    setError(null);
    setLoading(false);
    setResult(null);
    setCurrentIdx(0);
    try { if (typeof onClose === "function") onClose(); } catch {}
  }

  // --- smart parsers / generator (unchanged logic) ---
  function parseAmount(text) {
    if (!text) return null;
    const s = String(text).toLowerCase();
    const digits = s.replace(/[^\d,\.]/g, "").replace(/,/g, "");
    if (digits && /\d/.test(digits)) {
      const n = Number(digits);
      if (!Number.isNaN(n) && n > 0) return Math.round(n);
    }
    const small = {
      zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
      twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
      seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
      thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
      eighty: 80, ninety: 90,
    };
    const multipliers = { thousand: 1e3, lakh: 1e5, hundred: 100, crore: 1e7, million: 1e6 };
    const cleaned = s.replace(/-/g, " ").replace(/\band\b/g, " ");
    const parts = cleaned.split(/\s+/);
    let value = 0, current = 0;
    for (let p of parts) {
      if (small[p] !== undefined) current += small[p];
      else if (!isNaN(Number(p))) current += Number(p);
      else if (multipliers[p]) { if (current === 0) current = 1; value += current * multipliers[p]; current = 0; }
    }
    const total = value + current;
    if (total > 0) return Math.round(total);
    return null;
  }

  function normalizeTags(text) {
    if (!text) return [];
    const replaced = text.replace(/[\/|;]+/g, ",").replace(/\s{2,}/g, " ");
    const raw = replaced.split(/,|\n/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const stop = new Set(["and", "or", "the", "a", "an"]);
    const cleaned = raw.flatMap((r) => r.split(/\s+/).filter(Boolean)).filter((w) => !stop.has(w));
    const seen = new Set();
    const res = [];
    for (const t of cleaned) {
      if (!seen.has(t)) { seen.add(t); res.push(t); }
    }
    return res;
  }

  function buildDraft(collected) {
    let goal = 45000;
    if (collected.goal) {
      const parsed = parseAmount(collected.goal);
      if (parsed && parsed > 0) goal = parsed;
    }
    const tags = normalizeTags(collected.tags || "");
    return {
      title: collected.title || "Help needed",
      short:
        collected.short ||
        (collected.title
          ? `${collected.title} — please donate to support this urgent need.`
          : "Please help this urgent need."),
      goal,
      tags,
      images: [],
      pitch: collected.pitch || (collected.short || ""),
    };
  }

  async function generateDraftFromCollected(collected) {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 600));
      const draft = buildDraft(collected);
      setResult(draft);
      window.dispatchEvent(new CustomEvent("aura:generated", { detail: { result: draft } }));
      return draft;
    } catch (e) {
      setError("Failed to generate draft.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  // sequential flow
  async function runFlowFrom(index = 0) {
    setError(null);
    flowAbortRef.current = false;
    for (let i = index; i < QUESTIONS.length; i++) {
      if (!open || flowAbortRef.current) return;
      setCurrentIdx(i);
      setLiveText("");
      const q = QUESTIONS[i];

      try { await speakAsync(q.ask, ttsLang); } catch {}

      if (!open || flowAbortRef.current) return;

      if (!recognitionSupported) {
        setError("Voice not supported in this browser. Please type your answers.");
        return;
      }

      try {
        const answer = await listenOnce(20000, sttLang).catch((e) => {
          if (e && (e.name === "NotAllowedError" || /permission/i.test(String(e.message || "")))) {
            setMicBlocked(true);
          }
          return "";
        });
        const cleaned = (answer || "").trim();
        answersRef.current[q.key] = cleaned;
        await new Promise((r) => setTimeout(r, 350));
      } catch (e) {
        setError("Microphone error. Please click Start Mic to retry or type answers.");
        setMicBlocked(true);
        return;
      }
    }

    const draft = await generateDraftFromCollected(answersRef.current);
    if (draft) setResult(draft);
  }

  async function startQuestionFlow() {
    if (!recognitionSupported) {
      setError("Voice not supported in this browser.");
      return;
    }
    try { await runFlowFrom(0); } catch (e) { throw e; }
  }

  async function handleUserStartMic() {
    setMicBlocked(false);
    setError(null);
    try { await runFlowFrom(currentIdx); } catch (e) { setMicBlocked(true); }
  }

  async function handleManualListenOnce() {
    setError(null);
    try {
      stopSpeech();
      stopRecognition();
      const txt = await listenOnce(20000, sttLang);
      const cleaned = (txt || "").trim();
      if (cleaned) {
        setLiveText((prev) => (prev ? prev + " " + cleaned : cleaned));
        const q = QUESTIONS[currentIdx];
        answersRef.current[q.key] =
          (answersRef.current[q.key] || "") +
          (answersRef.current[q.key] ? " " : "") +
          cleaned;
      }
    } catch (e) {
      setError(e?.message || "Mic failed to start");
      if (e && (e.name === "NotAllowedError" || /permission/i.test(String(e.message || "")))) {
        setMicBlocked(true);
      }
    }
  }

  async function handleReask() {
    setError(null);
    try {
      stopRecognition();
      stopSpeech();
      const q = QUESTIONS[currentIdx];
      if (!q) return;
      await speakAsync(q.ask, ttsLang);
      const answer = await listenOnce(20000, sttLang).catch((err) => {
        if (err && (err.name === "NotAllowedError" || /permission/i.test(String(err.message || "")))) {
          setMicBlocked(true);
        }
        return "";
      });
      const cleaned = (answer || "").trim();
      if (cleaned) {
        setLiveText(cleaned);
        answersRef.current[q.key] = cleaned;
      }
    } catch (err) {
      setError("Error while re-asking. Please try again.");
    }
  }

  async function handleTestVoice() {
    const q = QUESTIONS[currentIdx];
    if (!q) return;
    stopRecognition();
    await speakAsync(q.ask, ttsLang);
  }

  async function handleSkipQuestion() {
    const q = QUESTIONS[currentIdx];
    answersRef.current[q.key] = answersRef.current[q.key] || "";
    setLiveText("");
    const next = currentIdx + 1;
    if (next < QUESTIONS.length) {
      setCurrentIdx(next);
      await runFlowFrom(next);
    } else {
      const draft = await generateDraftFromCollected(answersRef.current);
      if (draft) setResult(draft);
    }
  }

  async function handleGenerateNow() {
    const draft = await generateDraftFromCollected(answersRef.current);
    if (draft) setResult(draft);
  }

  function applyDraft() {
    if (!result) return;
    if (typeof onApplyDraft === "function") onApplyDraft(result);
    window.dispatchEvent(new CustomEvent("aura:applied", { detail: { draft: result } }));
    stopAll();
  }

  function handleTtsChange(e) {
    const newLang = e.target.value;
    stopSpeech();
    setTtsLang(newLang);
    setTimeout(() => {
      const q = QUESTIONS[currentIdx];
      if (open && q && !result) speakAsync(q.ask, newLang).catch(() => {});
    }, 120);
  }

  function handleSttChange(e) {
    const newLang = e.target.value;
    stopRecognition();
    setSttLang(newLang);
  }

  // --- wire up aura events ---
  useEffect(() => {
    function onRecording(e) {
      try {
        const rec = e?.detail?.recording;
        setListening(Boolean(rec));
        if (e?.detail?.error) setError(String(e.detail.error));
      } catch (err) {
        console.warn("onRecording handler error:", err);
      }
    }
    function onGenerated(e) {
      try {
        const { result: extResult } = e.detail || {};
        if (extResult) {
          setResult(extResult);
          setBanner(`Draft ready: ${extResult.title || extResult.short || "Draft"}`);
          setTimeout(() => setBanner(null), 5000);
        }
      } catch (err) {
        console.warn("onGenerated handler error:", err);
      }
    }
    window.addEventListener("aura:recording", onRecording);
    window.addEventListener("aura:generated", onGenerated);
    return () => {
      window.removeEventListener("aura:recording", onRecording);
      window.removeEventListener("aura:generated", onGenerated);
    };
  }, []);

  const curr = QUESTIONS[currentIdx];

  /* -------------------------
     Styles (self-contained)
     ------------------------- */
  const theme = {
    // palette
    bgTop: "#041428",
    bgBottom: "#05263a",
    panelAccent: "linear-gradient(135deg,#06b6d4,#3b82f6)",
    muted: "#9fb4d9",
    text: "#eaf6ff",
    danger: "#ef4444",
    cyan: "#06b6d4",
    micText: "#042c44",
  };

  const overlayStyle = {
    position: "fixed",
    inset: 0,
    zIndex: 12000,
    display: "flex",
    alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center",
    padding: isMobile ? 12 : 18,
    background: "rgba(2,6,23,0.6)",
    backdropFilter: "blur(6px)",
  };

  const cardBaseStyle = {
    width: isMobile ? "92vw" : 520,
    maxWidth: "96vw",
    maxHeight: "calc(100vh - 48px)",
    borderRadius: 14,
    boxShadow: "0 18px 60px rgba(3,15,37,0.28)",
    background: `linear-gradient(180deg, ${theme.bgTop}, ${theme.bgBottom})`,
    color: theme.text,
    overflow: "hidden",
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    border: "1px solid rgba(255,255,255,0.03)",
  };

  const headerStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    flex: "0 0 auto",
  };

  const mainStyle = {
    padding: 16,
    overflowY: "auto",
    maxHeight: "calc(100vh - 170px)",
  };

  const questionCardStyle = {
    position: "relative",
    padding: 14,
    borderRadius: 10,
    background: "linear-gradient(180deg, rgba(6,20,34,0.7), rgba(6,20,34,0.5))",
    border: "1px solid rgba(255,255,255,0.02)",
  };

  const micButtonBase = {
    width: 76,
    height: 76,
    borderRadius: 999,
    display: "inline-grid",
    placeItems: "center",
    fontSize: 28,
    cursor: "pointer",
    border: "none",
    transition: "transform 160ms ease, box-shadow 160ms ease",
  };

  const answerTextareaStyle = {
    width: "100%",
    minHeight: 90,
    padding: 12,
    borderRadius: 10,
    background: "rgba(2,10,18,0.36)",
    color: theme.text,
    border: "1px solid rgba(255,255,255,0.04)",
    fontSize: 15,
    lineHeight: 1.35,
    resize: "vertical",
  };

  /* -------------------------
     Render
     ------------------------- */

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aura AI — Voice campaign creator"
      style={overlayStyle}
      onKeyDown={(e) => {
        if (e.key === "Escape") stopAll();
      }}
    >
      <div ref={dialogRef} tabIndex={-1} style={cardBaseStyle} aria-describedby="aura-description">
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{/* emoji intentionally kept */}🤖 Aura AI</div>
            <div style={{ fontSize: 12, color: theme.muted }}>
              Voice-first campaign creator — one question at a time.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: theme.muted }}>TTS</div>
              <select
                value={ttsLang}
                onChange={handleTtsChange}
                aria-label="TTS language"
                style={{
                  minWidth: 120,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.18)",
                  color: theme.text,
                  border: "1px solid rgba(255,255,255,0.02)",
                }}
              >
                {LANG_OPTIONS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: theme.muted }}>STT</div>
              <select
                value={sttLang}
                onChange={handleSttChange}
                aria-label="STT language"
                style={{
                  minWidth: 120,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.18)",
                  color: theme.text,
                  border: "1px solid rgba(255,255,255,0.02)",
                }}
              >
                {LANG_OPTIONS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => stopAll()}
              aria-label="Close Aura"
              style={{
                background: "transparent",
                border: "none",
                color: theme.text,
                fontSize: 18,
                cursor: "pointer",
                padding: 6,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Transient banner */}
        {banner && (
          <div
            role="status"
            aria-live="polite"
            style={{
              alignSelf: "center",
              marginTop: 10,
              background: "linear-gradient(90deg,#ecfeff,#e0f2fe)",
              color: "#042c44",
              padding: "6px 12px",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              boxShadow: "0 6px 18px rgba(3,105,161,0.12)",
              zIndex: 5,
              marginLeft: 16,
              marginRight: 16,
            }}
          >
            {banner}
          </div>
        )}

        {/* Main content */}
        <div id="aura-description" style={mainStyle}>
          {!result ? (
            <>
              <div style={questionCardStyle} aria-live="polite">
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <div style={{ fontSize: 14, color: "#a7c3e6", fontWeight: 700 }}>
                    {curr ? `Q${currentIdx + 1}:` : "Finishing..."}
                  </div>
                  <div style={{ color: "#eaffff", fontSize: isMobile ? 15 : 15, lineHeight: 1.35 }}>
                    {curr ? curr.ask : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
                  <button
                    onClick={handleReask}
                    title="Re-ask this question"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.03)",
                      color: theme.text,
                      cursor: "pointer",
                    }}
                  >
                    🔁 Re-ask
                  </button>

                  <button
                    onClick={handleTestVoice}
                    title="Play the question audio"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.03)",
                      color: theme.text,
                      cursor: "pointer",
                    }}
                  >
                    🔊 Test voice
                  </button>

                  <div style={{ marginLeft: "auto", color: theme.muted, fontSize: 12 }}>
                    {listening ? "Listening…" : loading ? "Processing…" : ""}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: 12 }}>
                <div style={{ flex: "0 0 auto" }}>
                  <button
                    onClick={handleManualListenOnce}
                    className={listening ? "listening" : ""}
                    aria-label={listening ? "Listening" : "Start listening"}
                    style={{
                      ...micButtonBase,
                      borderRadius: 12,
                      background: listening ? theme.panelAccent : "linear-gradient(135deg,#0b6fb2,#0eb7e7)",
                      boxShadow: listening ? "0 20px 60px rgba(6,183,220,0.12)" : "0 10px 30px rgba(3,15,37,0.18)",
                      color: listening ? theme.micText : "#fff",
                      transform: listening ? "scale(1.04)" : "none",
                    }}
                  >
                    🎙
                    {/* small visual indicator dot */}
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        right: 8,
                        top: 8,
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: listening ? theme.cyan : "transparent",
                        boxShadow: listening ? "0 6px 12px rgba(2,170,200,0.14)" : "none",
                        transition: "all 160ms ease",
                      }}
                    />
                  </button>
                </div>

                <div style={{ flex: 1 }}>
                  <textarea
                    value={liveText}
                    onChange={(e) => {
                      setLiveText(e.target.value);
                      if (curr) answersRef.current[curr.key] = e.target.value;
                    }}
                    rows={4}
                    placeholder={recognitionSupported ? "Speak or type your answer here..." : "Type your answers here."}
                    aria-label="Answer"
                    style={answerTextareaStyle}
                  />

                  <div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {micBlocked && recognitionSupported && (
                        <button
                          onClick={handleUserStartMic}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 10,
                            background: "linear-gradient(135deg,#06b6d4,#3b82f6)",
                            color: "#042c44",
                            fontWeight: 700,
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Start Mic (allow)
                        </button>
                      )}
                    </div>

                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <button
                        onClick={handleSkipQuestion}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.03)",
                          background: "transparent",
                          color: theme.text,
                          cursor: "pointer",
                        }}
                      >
                        Skip
                      </button>

                      <button
                        onClick={handleGenerateNow}
                        style={{
                          padding: "9px 12px",
                          borderRadius: 10,
                          background: theme.panelAccent,
                          color: "#042c44",
                          border: "none",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Generate
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div role="alert" style={{ marginTop: 8, color: theme.danger, fontWeight: 700 }}>
                      {error}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ paddingBottom: 8 }}>
              <div style={{ fontSize: 14, color: "#a7c3e6", marginBottom: 10 }}>Draft generated</div>

              <div style={{ background: "rgba(255,255,255,0.02)", padding: 12, borderRadius: 10 }}>
                <h3 style={{ margin: "0 0 8px 0", fontSize: 16 }}>{result.title}</h3>
                <div style={{ color: "#9fb4d9", marginBottom: 8 }}>{result.short}</div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <div>
                    Goal: <strong>₹{result.goal?.toLocaleString?.() ?? result.goal}</strong>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(result.tags || []).map((t) => (
                      <div key={t} style={{ background: "rgba(255,255,255,0.03)", padding: "6px 8px", borderRadius: 8 }}>
                        #{t}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ color: "#cfe7ff" }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Suggested pitch</div>
                  <div style={{ fontSize: 13 }}>{result.pitch}</div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    onClick={applyDraft}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      background: theme.panelAccent,
                      border: "none",
                      color: "#042c44",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Use this draft
                  </button>

                  <button
                    onClick={() => {
                      try {
                        localStorage.setItem("aura_campaign_draft", JSON.stringify(result));
                        window.location.href = "/create?prefill=aura";
                      } catch {
                        stopAll();
                      }
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.03)",
                      color: theme.text,
                      cursor: "pointer",
                    }}
                  >
                    Edit in Create
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
