"use client";
import { useState } from "react";
import { ArrowLeft, Check, MessagesSquare, NotebookPen, Play } from "lucide-react";
import { useGita } from "@/lib/store/useGitaStore";
import { useDraft } from "@/lib/store/draftStore";
import { audio } from "@/lib/store/audioStore";
import { lessonDoneAt, markLessonDone } from "@/lib/store/readingPosition";
import type { ConnectionRelation } from "@/lib/types";
import { askPartha } from "@/components/chat/GraphRagChatbot";

const VERSE = "BG_2.47";

/** The three ways to answer, each kept as the relation of the note to the verse. Disagreement is welcome. */
const RESPONSES: { label: string; starter: string; relation: ConnectionRelation }[] = [
  { label: "I understand this as…", starter: "I understand this as ", relation: "relates_to" },
  { label: "I disagree, or I'm unsure…", starter: "I'm not sure about this, because ", relation: "questions" },
  { label: "This reminds me of…", starter: "This reminds me of ", relation: "reminds_me_of" },
];

function Step({ n, title, kind, children }: { n: number; title: string; kind?: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3" aria-labelledby={`lesson-step-${n}`}>
      <span className="num mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-line-2 text-[12.5px] font-medium text-text-3" aria-hidden>
        {n}
      </span>
      <div className="min-w-0">
        <h2 id={`lesson-step-${n}`} className="text-[16px] font-semibold text-text">
          {title}
          {kind && <span className="ml-2 align-middle text-[11.5px] font-normal text-text-3">{kind}</span>}
        </h2>
        <div className="mt-2">{children}</div>
      </div>
    </section>
  );
}

/**
 * "Start here": one short, complete lesson on BG 2.47. Source text and translation come from the data with their
 * attribution; the explanation and example are labelled as editorial (a draft for review, not a translation). It ends
 * in the person's own words and a clear next step.
 */
export function Lesson({ onClose }: { onClose: () => void }) {
  const verse = useGita((s) => s.versesById.get(VERSE));
  const versesDoc = useGita((s) => s.versesDoc);
  const enAuthor = useGita((s) => s.enAuthor);
  const [done, setDone] = useState(lessonDoneAt);
  if (!verse || !versesDoc) return null;
  const author = versesDoc.authors.find((a) => a.id === enAuthor);
  const translation = verse.translations.en?.[String(enAuthor)] || Object.values(verse.translations.en || {})[0] || "";

  const respond = (r: (typeof RESPONSES)[number]) => {
    const kind = useDraft.getState().startVerseNote(VERSE, r.relation);
    if (kind === "new") useDraft.getState().setText(r.starter);
    markLessonDone();
    setDone(Date.now());
    const g = useGita.getState();
    g.openLesson(false);
    g.setView("manas");
  };
  const finish = () => {
    markLessonDone();
    setDone(Date.now());
  };

  return (
    <div className="mx-auto max-w-[680px] px-5 pb-24 pt-6 sm:px-8 sm:pt-10">
      <button className="btn btn-ghost -ml-3 max-sm:h-11" onClick={onClose}>
        <ArrowLeft size={15} /> Back to reading
      </button>
      <header className="mt-4">
        <div className="label">Start here · one idea · about five minutes</div>
        <h1 className="serif mt-2 text-[30px] font-semibold leading-[1.15] tracking-[-0.01em] text-text sm:text-[34px]">Effort, without being ruled by the outcome</h1>
        {done && (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-text-3">
            <Check size={14} className="text-good" /> You finished this on {new Date(done).toLocaleDateString(undefined, { dateStyle: "medium" })}. It&apos;s here whenever you want to return.
          </p>
        )}
      </header>

      <div className="mt-8 space-y-9">
        <Step n={1} title="A question to hold">
          <p className="reading">Can you care deeply about your work and still not be ruled by how it turns out?</p>
        </Step>

        <Step n={2} title="The setting" kind="Context">
          <p className="reading">
            Arjuna stands in his chariot between two armies, with teachers and relatives on the other side. Overwhelmed, he puts down his bow and asks his friend and charioteer, Kṛṣṇa, what he should do. Chapter 2 is Kṛṣṇa&apos;s first long answer, and this verse is one of its best-known lines.
          </p>
        </Step>

        <Step n={3} title="The verse" kind={`BG ${verse.ref} · source`}>
          <div className="rounded-3 border border-line bg-surface p-4 sm:p-5">
            <div className="deva text-[19px] leading-[1.8] text-text [overflow-wrap:anywhere]">
              {verse.sanskrit.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
            <div className="serif mt-1.5 text-[14px] italic leading-[1.55] text-text-3 [overflow-wrap:anywhere]">{verse.iast.join(" ")}</div>
            <p className="serif mt-3 border-t border-line pt-3 text-[16.5px] leading-[1.65] text-text">{translation}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-text-3">
              <span>Translation: {author?.name ?? "default translator"}</span>
              <button className="btn btn-sm btn-ghost max-sm:h-10" onClick={() => audio.playVerse(VERSE)}>
                <Play size={13} /> Listen
              </button>
            </div>
          </div>
        </Step>

        <Step n={4} title="In plain words" kind="Explanation · editorial draft, not a translation">
          <p className="reading">
            What is yours is the doing: the effort, the care, the choices you make. How it lands is not entirely yours. The verse asks for two things at once: don&apos;t make the result the reason you act, and don&apos;t give up acting because the result isn&apos;t in your hands.
          </p>
          <p className="mt-2 text-[13px] leading-5 text-text-3">Commentators across traditions read this line in different ways. Open the verse to compare their readings.</p>
        </Step>

        <Step n={5} title="An everyday example" kind="Editorial draft">
          <p className="reading">
            Preparing for an exam, you can study steadily, ask for help and get some sleep. The questions and the marking are not yours to choose. If only the grade matters, every hour is anxious; if the work itself matters, you can give it your full attention, whatever the grade.
          </p>
        </Step>

        <Step n={6} title="In your own words">
          <p className="reading">How would you put this, or where do you disagree? Your answer is saved as a note on this verse, in your own words. You can change it or remove the connection later.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {RESPONSES.map((r) => (
              <button key={r.label} className="btn max-sm:h-11 max-sm:justify-start" onClick={() => respond(r)}>
                <NotebookPen size={14} /> {r.label}
              </button>
            ))}
          </div>
        </Step>

        <section className="rounded-3 border border-line bg-surface-2 p-4 sm:p-5" aria-label="What next">
          <h2 className="text-[15px] font-semibold text-text">{done ? "Where to go next" : "When you're ready"}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn max-sm:h-11" onClick={() => (useGita.getState().openChapter(2), useGita.getState().select(VERSE, { fly: false }))}>
              Read it in chapter 2
            </button>
            <button className="btn max-sm:h-11" onClick={() => askPartha("Explain BG 2.47 in simple words for someone new to the Gita.")}>
              <MessagesSquare size={14} /> Ask about it
            </button>
            <button className="btn max-sm:h-11" onClick={() => (useGita.getState().openChapter(2), useGita.getState().select("BG_2.48", { fly: false }))}>
              Next idea: BG 2.48, evenness of mind
            </button>
            {!done && (
              <button className="btn btn-ghost max-sm:h-11" onClick={finish}>
                <Check size={14} /> I&apos;m done for now
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
