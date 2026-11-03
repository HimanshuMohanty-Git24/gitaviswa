"use client";
// Shravana — the persistent recitation engine. Plays per-verse recitations (holy-bhagavad-gita.org) or full
// chapter recordings (archive.org), falls back to Web Speech synthesis offline, and keeps the graph in sync.
import { create } from "zustand";
import { useGita } from "./useGitaStore";
import { loadCommentary } from "@/lib/data/loader";
import { COMMENTATORS } from "@/lib/commentary/traditions";
import { chunkText, pickVoice, speechText } from "@/lib/commentary/speech";

export type AudioSource = "recitation" | "chapter" | "speech" | "commentary" | null;

/** A commentary being read aloud by the device's voice. */
export interface CommentaryReading {
  authorId: number;
  name: string;
  lang: "en" | "hi" | "sa";
  part: number;
  parts: number;
}

const AFTER_KEY = "gitaviswa:commentary-after";
const storedAfter = (): number | null => {
  try {
    return Number(localStorage.getItem(AFTER_KEY)) || null;
  } catch {
    return null;
  }
};

/** Voices load asynchronously in some browsers; wait briefly for them. */
function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((res) => {
    const t = setTimeout(() => res(speechSynthesis.getVoices()), 1500);
    speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(t);
        res(speechSynthesis.getVoices());
      },
      { once: true },
    );
  });
}

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
  /** Commentator to read aloud after each verse (one-verse-at-a-time mode), or null. */
  commentaryAfter: number | null;
  reading: CommentaryReading | null;
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
  commentaryAfter: storedAfter(),
  reading: null,
}));

const set = useAudio.setState;
const st = () => useAudio.getState();

/** Choose (or clear) the commentary read aloud after each verse. Remembered on this device. */
export function setCommentaryAfter(authorId: number | null) {
  set({ commentaryAfter: authorId });
  try {
    if (authorId) localStorage.setItem(AFTER_KEY, String(authorId));
    else localStorage.removeItem(AFTER_KEY);
  } catch {}
}

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

  /** The commentary being read: its chunks, voice, and a token that retires stale utterance callbacks. */
  private reading: { verseId: string; authorId: number; parts: string[]; voice: SpeechSynthesisVoice; lang: "en" | "hi" | "sa"; thenNext: boolean; tok: number } | null = null;
  /** Bumped by every stop, so an async step that resolves later knows it has been superseded. */
  private gen = 0;

  private stopSpeech() {
    this.gen++;
    this.reading = null;
    if (this.speaking && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.speaking = false;
    if (st().reading) set({ reading: null });
  }

  /**
   * Read a commentary aloud with the device's voice (English, Hindi; Sanskrit with a Hindi voice).
   * `thenNext`: this is the "after each verse" step, so continue to the next verse when done.
   */
  async readCommentary(verseId: string, authorId: number, { thenNext = false }: { thenNext?: boolean } = {}) {
    if (typeof speechSynthesis === "undefined") return set({ error: "This browser can't read text aloud." });
    const v = useGita.getState().versesById.get(verseId);
    this.el?.pause();
    this.stopSpeech();
    const my = this.gen;
    set({ verseId, chapter: v?.chapter ?? null, mode: "verse", loading: true, playing: false, error: undefined, source: "commentary", sourceLabel: "", approx: false, currentTime: 0, duration: 0 });
    const doc = await loadCommentary(verseId);
    if (my !== this.gen) return;
    const e = doc?.commentaries.find((c) => c.authorId === authorId);
    const name = COMMENTATORS[authorId]?.name ?? e?.author ?? "This commentator";
    if (!e || e.none || e.seeAlso) {
      set({ loading: false });
      if (thenNext) return this.afterCommentary();
      return set({ error: e?.seeAlso ? `${name} discusses this verse under BG ${e.seeAlso.slice(3)}.` : `${name} has no commentary on this verse.` });
    }
    const voices = await voicesReady();
    if (my !== this.gen) return;
    const voice = pickVoice(voices, e.lang);
    if (!voice) return set({ loading: false, error: e.lang === "en" ? "No English voice is available on this device." : "No Hindi voice is installed on this device, so this can't be read aloud." });
    const parts = chunkText(speechText(e));
    if (!parts.length) return thenNext ? this.afterCommentary() : set({ loading: false });
    this.reading = { verseId, authorId, parts, voice, lang: e.lang, thenNext, tok: 0 };
    this.speaking = true;
    set({ loading: false, playing: true, sourceLabel: `${voice.name}, this device's voice`, reading: { authorId, name, lang: e.lang, part: 0, parts: parts.length } });
    this.meta(`${name} on BG ${v?.ref ?? verseId.slice(3)}`, "Commentary, read aloud");
    this.sayPart(0);
  }

  private sayPart(i: number) {
    const r = this.reading;
    if (!r) return;
    if (i >= r.parts.length) {
      const thenNext = r.thenNext;
      this.reading = null;
      this.speaking = false;
      set({ playing: false, reading: null });
      if (thenNext) this.afterCommentary();
      return;
    }
    const tok = ++r.tok;
    const u = new SpeechSynthesisUtterance(r.parts[i]);
    u.voice = r.voice;
    u.lang = r.voice.lang;
    u.rate = (r.lang === "en" ? 1 : 0.95) * st().rate;
    u.onend = () => {
      if (this.reading === r && r.tok === tok) this.sayPart(i + 1);
    };
    u.onerror = (ev) => {
      if (this.reading !== r || r.tok !== tok || ev.error === "interrupted" || ev.error === "canceled") return;
      this.speaking = false;
      set({ playing: false, error: "The device voice stopped reading." });
    };
    const cur = st().reading;
    if (cur) set({ reading: { ...cur, part: i } });
    speechSynthesis.speak(u);
  }

  /** After a commentary read between verses: go on, unless continuing is switched off. */
  private afterCommentary() {
    if (st().autoAdvance) this.next();
    else set({ playing: false });
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
    this.stopSpeech();
    speechSynthesis.cancel();
    const my = this.gen;
    const u = new SpeechSynthesisUtterance([v.uvacha?.sa, ...v.sanskrit].filter(Boolean).join(" ").replace(/[।॥]/g, ", "));
    const voices = speechSynthesis.getVoices();
    const voice = voices.find((x) => x.lang.startsWith("sa")) || voices.find((x) => x.lang === "hi-IN") || voices.find((x) => x.lang.startsWith("hi"));
    if (voice) u.voice = voice;
    u.lang = voice?.lang || "hi-IN";
    u.rate = 0.78 * st().rate;
    u.onend = () => {
      if (my !== this.gen) return;
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
    if (s.source === "commentary") {
      if (speechSynthesis.speaking && !speechSynthesis.paused) {
        speechSynthesis.pause();
        set({ playing: false });
      } else if (speechSynthesis.paused) {
        speechSynthesis.resume();
        set({ playing: true });
      } else if (s.verseId && s.reading) void this.readCommentary(s.verseId, s.reading.authorId);
      else if (s.verseId) this.playVerse(s.verseId);
      return;
    }
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
    const r = this.reading;
    if (st().source === "commentary" && r) {
      // Jump to a passage: retire the current utterance's callbacks, then read from there.
      r.tok++;
      speechSynthesis.cancel();
      set({ playing: true });
      return this.sayPart(Math.min(r.parts.length - 1, Math.max(0, Math.floor(frac * r.parts.length))));
    }
    if (this.el && this.el.duration) this.el.currentTime = frac * this.el.duration;
  }

  setRate(rate: number) {
    set({ rate });
    if (this.el) this.el.playbackRate = rate;
  }

  private onEnded() {
    const s = st();
    // Commentary after each verse: read it, then afterCommentary() continues.
    if (s.mode === "verse" && s.commentaryAfter && s.verseId && s.source !== "commentary") return void this.readCommentary(s.verseId, s.commentaryAfter, { thenNext: true });
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
