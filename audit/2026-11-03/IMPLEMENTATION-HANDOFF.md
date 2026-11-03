# Implementation handoff — Gita Vishwas / GitaViśva

Read [PRODUCT-AUDIT.md](PRODUCT-AUDIT.md) for evidence, context, and the intended experience. This file turns its findings into work packages. It is a proposed backlog, not authorization to publish, introduce a remote journal service, or replace the current application wholesale.

## Product outcome

A person can save any thought, learn from an inspectable teaching if they choose, record their own interpretation, see meaningful connections, and revisit their thinking later. A thought with no scripture connection is a valid, complete object.

## Implementation constraints

- Keep the current Next.js/React/TypeScript stack and useful existing reader, graph, audio, retrieval, and local-storage capabilities.
- Protect existing IndexedDB entries. Introduce schema versions and backward-compatible migrations before changing stored data. Do not reset the database during development to hide migration problems.
- Preserve original user text as the source of truth. AI output is separate, attributed, optional material.
- Separate suggested from user-approved relationships. A graph edge is not evidence that a user endorses an interpretation.
- Do not make a cloud account, API key, emotional score, or verse match a condition of saving.
- Do not send journal text, private labels, or conversation content into analytics. Remote AI receives only the explicitly selected context after understandable disclosure.
- Keep public scripture nodes and personal annotations separate. User edits must not rewrite canonical/source data.
- Preserve deep-link compatibility for current `view`, `chapter`, and `node` URLs while improving navigation.
- Use meaningful behavioral and migration checks for changes that protect writing. Avoid tests that merely reproduce component markup.
- Implement a narrow complete journey before undertaking a broad visual redesign. Keep the current palette and type foundation unless user testing identifies a specific issue.

## Recommended execution order

**Track 1, first:** T01 → T02 → T03 → T04. Establish reliable writing and a migration-safe personal model.

**Track 2, after that foundation:** T05 → T06 → T07. Complete the personal loop and the small map.

**Track 3:** T08 and T09 establish approachable learning and the Ask handoff.

**Quality throughout:** T10, T11, T12, and T13 cover reflow, accessibility, navigation, language, and custody.

**Before broader release:** T14 and T15 validate offline/device behavior, editorial quality, and usability. T16 prepares the story only after its demonstrated features exist.

These tracks identify dependencies; they do not request subagents or prescribe a staffing model. Effort labels below are relative uncertainty/scope estimates, not time commitments.

## T01 · P0 · Make drafts and saves trustworthy

**Findings:** F04, F05, F21. **Effort:** M. **Dependency:** none.

**Files:** `src/components/manas/PersonalMindMapper.tsx`, `src/lib/store/personalStore.ts`, `src/lib/store/useGitaStore.ts`, `src/lib/types.ts`.

**Work:**

1. Move the writing draft into a local durable store with an explicit draft ID and update timestamp.
2. Persist writing independently of analysis, with a bounded debounce and a flush strategy for task transitions where practical.
3. Save the current text version. Bind generated suggestions to the text version they analyzed; invalidate or mark them stale after edits.
4. Preserve text on save failure. Surface saving, saved, and failure states without false success.
5. Prevent accidental duplicate entries from double taps or overlapping saves.
6. Distinguish load failure from a legitimately empty history.

**Acceptance:**

- Type a unique paragraph, switch Read/Ask/Explore, and return: all text remains.
- Reload while a draft exists: it is restored and identified as a draft.
- Analyze A, change to B, save: B is saved; outdated suggestions are not silently confirmed for B.
- Simulate write failure: the composer retains B, shows a retry path, and does not announce success.
- Repeated Save activation creates one intended entry.
- Existing saved entries still load unchanged.

**Test emphasis:** persistence and interruption behavior, rejected storage operations, duplicate saves, and migration. Do not rely only on a component snapshot.

## T02 · P1 · Save any thought without interpreting it first

**Findings:** F02, F03, F06. **Effort:** M. **Dependency:** T01.

**Work:** Make Save thought the immediate primary action. Make connection exploration optional. Remove the default heaviness value from new entries. Permit untyped writing and an optional check-in. Include examples of an idea, gratitude, a verse question, and an everyday difficulty.

**Acceptance:**

- An unrelated thought saves with no emotions, dilemmas, verses, or intensity.
- Skipped check-in is stored as absent, not as zero or Heavy.
- No-match writing has a complete success state and a valid personal node.
- Core save works without an AI provider or network.
- Existing entries with an intensity value keep their historical value; migration does not pretend the value was explicitly chosen.

## T03 · P1 · Introduce an explicit personal-connection model

**Findings:** F02, F09, F18, F19. **Effort:** L. **Dependency:** T01; coordinate with T02.

**Files:** `types.ts`, `graphStore.ts`, `personalStore.ts`, personal mapping and graph inspector components.

**Suggested contract, to refine with the existing code:**

```ts
type PersonalConnection = {
  id: string;
  targetId: string;
  relation: "relates_to" | "asks_about" | "questions" | "reminds_me_of" | "responds_to";
  status: "suggested" | "accepted" | "rejected";
  origin: "user" | "local_retrieval" | "ai";
  explanation?: string;
  sourceTextVersion?: number;
  createdAt: number;
};

type ThoughtOrigin =
  | { kind: "free" }
  | { kind: "verse"; verseId: string }
  | { kind: "ask"; question: string; citedNodeIds: string[] }
  | { kind: "thought"; thoughtId: string };
```

This sketch is a direction, not a requirement to copy these exact identifiers. Choose relation types that map cleanly into the existing graph. Include a schema version, updatedAt, text version, and separate optional generated interpretation. Treat older machine-created edges as legacy suggestions unless the migration can prove explicit approval. Do not invent approval history.

**Acceptance:**

- A thought can link to a verse, concept, or another personal thought.
- A connection can represent a question or disagreement.
- Original source context is distinguishable from a meaning the user endorses.
- Approved and suggested edges look and behave differently.
- Zero connections remains valid.
- Dangling references from deleted/imported thoughts are handled without crashing the graph.
- Export/import preserves provenance and status; older backups remain importable through validation/migration.

## T04 · P1 · Let the person review suggested meaning

**Findings:** F02, F14, F19, F28. **Effort:** M–L. **Dependency:** T02, T03.

**Work:** Separate intent detection from candidate retrieval. Default to explaining the writing's possible themes without asserting the writer's feelings. Show a few candidates with plain-language reasons. Add Keep connection, Doesn't fit, Choose another, and No connection yet. Do not present normalized relevance as psychological confidence.

**Acceptance examples:**

| Input | Required behavior |
|---|---|
| “Could a city be designed around cooperation rather than competition?” | No assertion of crisis of faith or distress; a relevant optional connection or a no-clear-match state |
| “Explain BG 2.47.” | A teaching explanation, without telling the person they are anxious |
| “I feel worried about tomorrow.” | Tentative acknowledgment grounded in the expressed feeling; optional connection |
| “I am not angry; I am curious about anger in the text.” | No user anger label based only on keyword occurrence |
| A joyful event or gratitude | Welcome it without a distress score |
| A quotation describing someone else's despair | Distinguish subject/context rather than claiming the feeling belongs to the user |

Add a reviewed small evaluation set, including English/Hindi/Hinglish and unrelated intellectual writing. Define false-positive tolerances before changing thresholds. Human review of a sample matters more than an impressive numerical “match strength.”

## T05 · P1 · Build thought detail, editing, and recovery

**Findings:** F07, F08, F16. **Effort:** M–L. **Dependency:** T01–T03.

**Work:** Make the history row open a personal thought detail. Display full text, dates, origin, approved/suggested connections, and separate AI material. Add edit, add later response, and recoverable deletion with Undo. Keep old writing when adding a dated revisit. Avoid showing aggregate charts before access to the entries themselves.

**Acceptance:**

- Long entries are fully readable directly from history.
- Editing an entry updates list, graph label, and local search.
- AI interpretation is identified and never overwrites the original text.
- A later response retains both dates and the earlier wording.
- Accidental delete can be reversed in the normal product flow.
- Deleting a connection does not delete the thought.

## T06 · P1 · Make personal writing locally searchable

**Findings:** F07, F25. **Effort:** M. **Dependency:** T05.

**Files:** `CommandPalette.tsx`, `search.ts`, `useGitaStore.ts`, thought list/detail.

**Work:** Index personal text locally and update on create/edit/delete/import. Add an explicit My thoughts group and an in-Reflect search. Preserve the distinction between scripture, user writing, and generated interpretation. Start with simple text search and dates rather than a large taxonomy UI.

**Acceptance:** A distinctive phrase from the saved cooperation idea finds that exact thought. Edits and deletions update results. No private search terms or content are sent to external search/model services unless the person explicitly invokes an AI action.

## T07 · P1 · Build a small understandable personal map

**Findings:** F17, F18, F30. **Effort:** L. **Dependency:** T03–T05.

**Work:** Begin on a selected thought, not the full 858-node network. Show 0–5 readable connections, clear edge meanings, provenance, and a source preview. Provide an equivalent accessible list. Allow expand to related neighborhood, chapter, and whole graph. Reuse the existing lineage/list implementation where practical.

**Acceptance:**

- An unconnected thought is visible and complete.
- The current thought stays readable while inspecting an adjacent idea.
- The person can explain a link from the visible label/reason.
- Accepting/removing a suggestion updates the map immediately and persistently.
- A user can complete all personal map actions without WebGL or a pointer.
- The global 3D graph remains available and does not need to load before saving a thought.

## T08 · P1 · Add a beginner learning loop and verse reflection

**Findings:** F09, F10, F11, F26. **Effort:** L. **Dependency:** T02, T03, T05.

**Work:** Prototype one complete short lesson before building a large curriculum. Include narrative context, attributed source, a labeled explanation, one example, a user response, and a continuation. Add Reflect on this verse to details and the reader. Add bookmark/resume behavior. Make mobile meaning easier to reach by simplifying the controls above it.

**Acceptance:**

- A beginner can identify what to learn first.
- The first unit has a clear completion boundary.
- A saved verse note retains its source reference.
- The user can record uncertainty or disagreement without being corrected automatically.
- Return restores the reading location rather than the chapter's beginning.
- Original verse and translator attribution remain accessible alongside simple explanations.

## T09 · P1/P2 · Improve Ask context, formatting, and takeaway saving

**Findings:** F13–F16. **Effort:** M–L. **Dependency:** T03, T05 for personal handoff.

**Work:** Make answer intent explicit. Resolve conversational references for retrieval using active sources and bounded history. Define supported output formatting. Support mobile-friendly examples or safe responsive tables. Add Save my takeaway and a reliable Back to answer route. Preserve local answer fallback without pretending it is the same capability as a generative model.

**Acceptance:**

- Re-run the audited beginner question and follow-up: readable examples, no raw table delimiters, no assigned anxiety.
- “Why?” after a verse explanation retains relevant sources.
- Opening and closing a citation restores answer position and input draft.
- Save my takeaway creates editable user writing with source references and separate optional quoted AI material.
- Cancel, provider failure, and a long answer leave the composer usable.
- Do not auto-scroll a person away from material they are actively reading; offer a new-content affordance when appropriate.

## T10 · P1 · Fix mobile reflow and control hierarchy

**Findings:** F11, F12, F23, F32. **Effort:** M. **Dependency:** start immediately; retest after all surface changes.

**Work:** Correct long-script wrapping, inner scroll widths, narrow verse gutters, and unsupported output. Give phone controls comfortable hit areas. Reduce the mobile detail's initial control stack. Add an expanded player with replay/previous/next and a useful seek target.

**Acceptance:**

- At actual CSS widths 320, 355, 390, and 430px, reader and Ask do not require horizontal content scrolling.
- Source text remains complete, including diacritics and script marks.
- Body text enlargement does not obscure Save or block navigation.
- Primary phone controls use a 44–48px design target unless a documented contextual exception is intentional.
- Opening a verse exposes meaningful content immediately.
- Reader with audio plus Ask/Details remains operable on a short screen.

**Test distinction:** A canvas may support spatial panning; that does not justify horizontal overflow in reading text or forms.

## T11 · P1 · Fix modal and keyboard accessibility

**Findings:** F22, F23, F30. **Effort:** M. **Dependency:** none; reuse improvements across new screens.

**Work:** Establish a shared modal primitive with focus entry, focus containment, inert background, Escape and focus restoration. Audit tabs/radios, search labeling, icons, screen-reader announcements, and list equivalents to graph actions. Add a skip-to-main path where appropriate. Treat desktop nonmodal docks differently from blocking dialogs.

**Acceptance:**

- Open guide from the brand button and press Tab: focus stays in the guide.
- Close it: focus returns to the brand button.
- Repeat for settings and search, with proper dialog names and visible focus.
- Radio/tab keyboard behavior matches the chosen accessible pattern.
- Streaming content does not overwhelm screen-reader announcements.
- Reduced motion and graph alternatives preserve the task's meaning.
- A real screen-reader pass supplements DOM inspection.

## T12 · P2 · Define navigation, language, and daily settings

**Findings:** F01, F24, F26, F31. **Effort:** L. **Dependency:** prototype the target journey before broad nav migration.

**Work:** Test Today / Learn / Reflect / My map / Ask as a proposed five-destination hierarchy. Nest lineage under relationships. Add meaningful history, Back to origin, restored scroll position, persistent reading/language preferences, and everyday settings. Keep API/provider/database configuration under Advanced.

**Acceptance:**

- Browser/system Back retraces meaningful destinations or closes the correct layer.
- Existing verse deep links still resolve.
- Script choice, meaning language, and interface language are distinct concepts.
- Hindi meanings are consistent through supported reader/detail flows.
- A person can use the core product without opening advanced integrations.

## T13 · P1/P2 · Align privacy language and backup custody

**Findings:** F20, F21. **Effort:** M–L. **Dependency:** T01; coordinate with AI handoffs and model schema.

**Work:** Replace inconsistent absolute privacy claims. Explain local saved scope, optional model transmission, content included, provider destination, and unencrypted exports. Add clear first-use AI disclosure, backup status, validated restore/merge, and user-oriented storage errors. Define sync as a separate privacy/product decision.

**Acceptance:**

- First-time mobile users can describe what Deepen/AI sends before invoking it.
- Local save remains available without accepting AI transfer.
- “Saved” is not presented as automatic cross-device synchronization.
- Restore a backup in an empty browser and verify text, dates, provenance, accepted links, and standalone nodes.
- Invalid/partially incompatible backups receive understandable validation without erasing existing writing.
- Load failure cannot masquerade as an empty history.

## T14 · P2 · Verify production offline, audio, and device behavior

**Findings:** F29, F30, F32. **Effort:** M–L. **Dependency:** reliable core loop.

**Work:** Test a production build on actual phones. Separate offline shell/data, cached commentary, optional AI, remote recordings, and synthesized voice. Add WebGL/fetch/storage recovery. Measure responsiveness and memory on a realistic low-end Android device before selecting performance changes.

**Acceptance:**

- Restart disconnected and access previously saved thoughts.
- Open cached and uncached content: each has truthful availability and a recovery action.
- Provider failure returns a clearly described local fallback or retry.
- Audio interruptions, backgrounding, replay, follow-along opt-out, and source changes are understandable.
- Keyboard appearance does not hide the composer or Save/Send.
- The app survives a background/foreground interruption without losing a thought.
- Record actual production results and limitations; do not substitute development build timing.

## T15 · P2 · Review content and validate with people

**Findings:** F19, F27, F28 and adoption section of the main report. **Effort:** ongoing, bounded first round. **Dependency:** usable prototype from T01–T09.

**Work:** Review provenance, commentary punctuation, simple explanations, metaphors, personal-advice framing, generated regional meanings, and crisis handling with appropriate expertise. Run the eight usability tasks in the report with 6–8 initial participants. Include real assistive-technology and language validation separately.

**Acceptance:** Report actual task completion and misunderstandings. Most importantly, users can keep an ordinary idea, reject a bad connection, understand one teaching, return to the original thought, and explain the privacy boundary. Revise based on observed failure rather than adding features to improve a dashboard metric.

## T16 · P3 · Prepare a demonstrable product story

**Findings:** storytelling section. **Effort:** S–M. **Dependency:** the features shown in the story must work.

**Work:** Storyboard the 75–90 second thought → optional teaching → personal interpretation → small map → later revisit sequence. Include an ordinary intellectual thought. Use the full graph as a short contextual reveal after the personal meaning is clear. Capture screens from the actual verified build.

**Acceptance:** Every claimed behavior has a working UI demonstration. Proposed screens are labeled as prototypes. There is no unsupported health-outcome claim, universal “everything offline” claim, or suggestion that the model decides what a person's thought truly means.

## Minimum regression and evaluation set

### Protect writing

- New entry; long entry; blank/whitespace; edit existing; repeated Save; save failure; load failure.
- Draft across views, source inspection, reload, backgrounding, and interrupted process.
- Analyze then edit; stale async response after edit; save while suggestion generation is in progress.
- Existing database migration; old backup import; duplicate IDs; malformed backups; missing relationship targets.
- Undo deletion; restore; exported backup round trip.

### Respect meaning

- Intellectual cooperation idea; neutral observation; joyful memory; gratitude; explicit emotion; negation; quotation; ambiguous topic; verse disagreement; no plausible match.
- English, Hindi, and representative Hinglish inputs, including language-specific spelling variants.
- AI unavailable and local-only path.
- Candidate rejected, accepted, edited, removed, and replaced; rejected candidates do not quietly reappear as accepted edges or aggregate patterns.

### Learn and navigate

- First visit to a short learning unit; full reader; bookmark; resume; verse note; Ask takeaway; thought detail → verse → Back.
- Ask explanation → ambiguous follow-up → citation → return; switching subject changes retrieval context.
- Mobile 320/355/390/430 widths, tablet 768/1024, desktop around 1440; short viewport; large text; real keyboard and safe-area behavior.
- Long Sanskrit, IAST, Hindi, and selected regional scripts, long AI prose, comparison formatting, and error text.
- Keyboard/modal focus; screen reader; reduced motion; graph list equivalence; both themes.

## Definition of the next credible milestone

The milestone is complete when a person can:

1. Arrive and understand what the product offers.
2. Save a thought safely without a match, score, or model.
3. Choose a useful connection or decline it.
4. Open a source and understand a small teaching.
5. Keep their own interpretation and return to the original thought.
6. See a readable personal map and find the entry later.
7. Understand local custody, backup, and optional AI transfer.

Document the checks actually run and the known limitations. Do not close the milestone merely because the screens look finished.
