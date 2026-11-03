"use client";
// Shravana — the persistent recitation engine. Plays per-verse recitations (holy-bhagavad-gita.org) or full
// chapter recordings (archive.org), falls back to Web Speech synthesis offline, and keeps the graph in sync.
import { create } from "zustand";
import { useGita } from "./useGitaStore";

export type AudioSource = "recitation" | "chapter" | "speech" | null;

interface AudioState {
  verseId: string | null;
  chapter: number | null;
  mode: "verse" | "chapter";
  playing: boolean;
  loading: boolean;
  autoAdvance: boolean;
  follow: boolean;
  rate: number;
  source: AudioSource;
  sourceLabel: string;
  currentTime: number;
  duration: number;
  approx: boolean;
  error?: string;
}

export const useAudio = create<AudioState>(() => ({
  verseId: null,
  chapter: null,
  mode: "verse",
  playing: false,
  loading: false,
  autoAdvance: true,
  follow: true,
  rate: 1,
  source: null,
  sourceLabel: "",
  currentTime: 0,
  duration: 0,
  approx: false,
}));

const set = useAudio.setState;
const st = () => useAudio.getState();

class AudioEngine {
  private el: HTMLAudioElement | null = null;
  private chapterSourceIdx = 0;
  private speaking = false;

  private ensure(): HTMLAudioElement {
    if (this.el) return this.el;
    const el = new Audio();
    el.preload = "auto";
    el.addEventListener("playing", () => set({ playing: true, loading: false }));
    el.addEventListener("pause", () => set({ playing: false }));
    el.addEventListener("waiting", () => set({ loading: true }));
    el.addEventListener("ended", () => this.onEnded());
    el.addEventListener("error", () => this.onError());
    el.addEventListener("loadedmetadata", () => set({ duration: el.duration || 0 }));
    el.addEventListener("timeupdate", () => this.onTime());
    this.el = el;
    this.bindMediaSession();
    return el;
  }

  private bindMediaSession() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => this.toggle());
    ms.setActionHandler("pause", () => this.toggle());
    ms.setActionHandler("nexttrack", () => this.next());
    ms.setActionHandler("previoustrack", () => this.prev());
  }

  private meta(title: string, album: string) {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "Śrīmad Bhagavad Gītā · GitaViswa", album });
  }

  private follow(id: string) {
    if (st().follow) useGita.getState().fly(id);
  }

  private stopSpeech() {
    if (this.speaking && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.speaking = false;
  }

  playVerse(id: string) {
    const g = useGita.getState();
    const v = g.versesById.get(id);
    if (!v) return;
    this.stopSpeech();
    const ch = g.versesDoc?.chapters.find((c) => c.number === v.chapter);
    set({ verseId: id, chapter: v.chapter, mode: "verse", loading: true, error: undefined, source: "recitation", sourceLabel: "holy-bhagavad-gita.org", approx: false, currentTime: 0, duration: 0 });
    const el = this.ensure();
    el.src = v.audio.verse[0];
    el.playbackRate = st().rate;
    el.play().catch(() => this.speak(id));
    this.meta(`BG ${v.ref}`, ch ? `Chapter ${ch.number} · ${ch.title}` : "");
    this.follow(id);
  }

  playChapter(n: number, sourceIdx = 0) {
    const g = useGita.getState();
    const ch = g.versesDoc?.chapters.find((c) => c.number === n);
    if (!ch) return;
    this.stopSpeech();
    const src = ch.audio[sourceIdx];
    if (!src) {
      set({ error: "No chapter recording is available, so verses play one at a time.", mode: "verse" });
      return this.playVerse(`BG_${n}.1`);
    }
    this.chapterSourceIdx = sourceIdx;
    set({ chapter: n, mode: "chapter", loading: true, error: undefined, source: "chapter", sourceLabel: src.source, approx: true, verseId: `BG_${n}.1`, currentTime: 0, duration: src.duration || 0 });
    const el = this.ensure();
    el.src = src.url;
    el.playbackRate = st().rate;
    el.play().catch(() => this.onError());
    this.meta(`Chapter ${n} · ${ch.title}`, src.title);
    this.follow(`BG_${n}.1`);
  }

  /** Offline / failure fallback: Sanskrit read by the platform speech engine (hi-IN voice, sa-IN if present). */
  speak(id: string) {
    const v = useGita.getState().versesById.get(id);
    if (!v || typeof speechSynthesis === "undefined") {
      set({ loading: false, playing: false, error: "Audio unavailable offline on this device." });
      return;
    }
    this.el?.pause();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance([v.uvacha?.sa, ...v.sanskrit].filter(Boolean).join(" ").replace(/[।॥]/g, ", "));
    const voices = speechSynthesis.getVoices();
    const voice = voices.find((x) => x.lang.startsWith("sa")) || voices.find((x) => x.lang === "hi-IN") || voices.find((x) => x.lang.startsWith("hi"));
    if (voice) u.voice = voice;
    u.lang = voice?.lang || "hi-IN";
    u.rate = 0.78 * st().rate;
    u.onend = () => {
      this.speaking = false;
      set({ playing: false });
      this.onEnded();
    };
    this.speaking = true;
    speechSynthesis.speak(u);
    set({ verseId: id, chapter: v.chapter, playing: true, loading: false, source: "speech", sourceLabel: voice ? `speech · ${voice.name}` : "speech synthesis", mode: "verse", error: undefined });
    this.follow(id);
  }

  toggle() {
    const s = st();
    if (s.source === "speech") {
      if (speechSynthesis.speaking && !speechSynthesis.paused) {
        speechSynthesis.pause();
        set({ playing: false });
      } else if (speechSynthesis.paused) {
        speechSynthesis.resume();
        set({ playing: true });
      } else if (s.verseId) this.speak(s.verseId);
      return;
    }
    if (!this.el || !this.el.src) {
      const sel = useGita.getState().selectedId;
      return this.playVerse(sel?.startsWith("BG_") ? sel : "BG_1.1");
    }
    if (this.el.paused) this.el.play().catch(() => this.onError());
    else this.el.pause();
  }

  stop() {
    this.stopSpeech();
    this.el?.pause();
    set({ playing: false });
  }

  /** End the listening session entirely (hides the player). */
  dismiss() {
    this.stop();
    if (this.el) {
      this.el.removeAttribute("src");
      this.el.load();
    }
    set({ verseId: null, chapter: null, currentTime: 0, duration: 0, error: undefined, loading: false, source: null, sourceLabel: "" });
  }

  private neighbour(delta: number): string | null {
    const s = st();
    const verses = useGita.getState().versesDoc?.verses;
    if (!verses || !s.verseId) return null;
    const i = verses.findIndex((v) => v.id === s.verseId);
    return verses[i + delta]?.id ?? null;
  }

  next() {
    const s = st();
    if (s.mode === "chapter" && s.chapter) return s.chapter < 18 ? this.playChapter(s.chapter + 1) : this.stop();
    const id = this.neighbour(1);
    if (id) this.playVerse(id);
  }

  prev() {
    const s = st();
    if (s.mode === "chapter" && s.chapter) return s.chapter > 1 ? this.playChapter(s.chapter - 1) : undefined;
    const id = this.neighbour(-1);
    if (id) this.playVerse(id);
  }

  seek(frac: number) {
    if (this.el && this.el.duration) this.el.currentTime = frac * this.el.duration;
  }

  setRate(rate: number) {
    set({ rate });
    if (this.el) this.el.playbackRate = rate;
  }

  private onEnded() {
    const s = st();
    if (!s.autoAdvance) return set({ playing: false });
    this.next();
  }

  private onError() {
    const s = st();
    if (s.mode === "chapter" && s.chapter) {
      const ch = useGita.getState().versesDoc?.chapters.find((c) => c.number === s.chapter);
      if (ch && this.chapterSourceIdx + 1 < ch.audio.length) return this.playChapter(s.chapter, this.chapterSourceIdx + 1);
      set({ error: "The chapter recording could not be reached, so verses play one at a time." });
      return this.playVerse(`BG_${s.chapter}.1`);
    }
    if (s.verseId) this.speak(s.verseId);
  }

  /** In chapter mode, estimate the verse being chanted from the syllable-proportional offsets. */
  private onTime() {
    const el = this.el!;
    set({ currentTime: el.currentTime, duration: el.duration || st().duration });
    const s = st();
    if (s.mode !== "chapter" || !s.chapter || !el.duration) return;
    const frac = el.currentTime / el.duration;
    const verses = useGita.getState().versesDoc?.verses.filter((v) => v.chapter === s.chapter) || [];
    let cur = verses[0];
    for (const v of verses) if (v.audio.chapterFrac <= frac) cur = v;
    if (cur && cur.id !== s.verseId) {
      set({ verseId: cur.id });
      this.follow(cur.id);
    }
  }
}

export const audio = new AudioEngine();
