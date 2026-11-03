# Gita Vishwas — product, usability, and adoption audit

**Audited:** 3 November 2026 · **Application:** http://localhost:3000 · **Workspace:** `D:\GitaGraph`  
**Current interface name:** GitaViśva / गीताविश्व. “Gita Vishwas” is the working name used in the brief; this audit does not prescribe a rename.  
**Deliverables:** this report, [implementation handoff](IMPLEMENTATION-HANDOFF.md), and [evidence index](evidence/README.md).

## 1. Executive assessment

The application already contains the ingredients for a distinctive product: an extensive Gita reader, multiple interpretive traditions, recitation, a question-answering companion, and personal reflections that really do become graph nodes. The warm visual language and attention to Sanskrit give it a coherent identity. The problem is the order and meaning of the experience.

**Today the product asks people to understand its knowledge system before it helps them understand one of their own thoughts.** Its opening promise is a knowledge graph; its reflection flow interprets writing primarily as an emotional difficulty; its reading flow presents a substantial text collection. The intended product is broader: a welcoming place to think, learn, question, disagree, and gradually recognize connections between one's life and the Gita.

The highest-value change is a complete, dependable loop:

> Capture a thought → keep it safely → optionally explore a relevant teaching → form your own interpretation → see that connection → revisit what changed.

Every thought must be valid even when no Gita connection is found. The graph should be an understandable record of those connections, with the full cosmic view available for exploration.

### Five decisions that matter most

1. **Make saving independent of analysis.** A person should be able to keep an ordinary idea, a question, a verse note, or an emotional reflection immediately.
2. **Give users authority over meaning.** Suggested emotions and links need to be optional, explainable, and removable. A weak lexical match must not become a claim about the person.
3. **Make learning feel achievable.** Offer one small learning unit, a plain explanation, a source, a question in the user's own words, and a visible next step.
4. **Begin the graph with the person.** Show one thought and a few labeled connections. Expand into the full graph on request.
5. **Make returning worthwhile.** Let people reopen, edit, search, connect, and revisit their thoughts. A library that accumulates entries is not yet a reflective practice.

### Highest-priority findings

| Priority | Finding | Why it matters |
|---|---|---|
| P0 | Unfinished reflections disappear when the user changes views | Writing is the core personal investment in this product |
| P0 | Editing the composer after analysis leaves a stale draft available to save | The text saved can differ from the text currently displayed in the composer |
| P1 | A neutral intellectual idea was labeled as a crisis of faith and saved as “heavy” | The application can misrepresent its user's inner life |
| P1 | There is no direct save-without-analysis or connection-review flow | Ordinary thoughts do not have an equal place in the product |
| P1 | Saved reflections cannot be edited or conveniently reopened from their list | The promised personal knowledge space is difficult to maintain |
| P1 | Long Sanskrit/transliteration causes horizontal scrolling on phones | Reading and asking require avoidable sideways navigation |
| P1 | The welcome dialog leaves keyboard focus behind it | A visible modal does not reliably contain keyboard interaction |
| P1 | Meaning and learning actions sit below many controls in mobile verse details | The simplest learning task takes too much interface work |

**Priority definitions:** P0 = protect before inviting people to entrust real writing; P1 = necessary for a credible core journey; P2 = improve before broader adoption; P3 = later opportunity. These are product judgments, not measured incident rates or a formal security classification.

## 2. Method, scope, and confidence

This is an expert product inspection of the running application, supported by source review. It is not user research, a clinical evaluation, a penetration test, or a complete accessibility certification. Claims about motivation and adoption are hypotheses to validate with users.

I inspected the single-page application's four primary views, Ask, the first-run guide, search, verse details, commentary, graph tools, paths, causal chains, player, and settings. The app uses URL query state rather than separate page routes for most destinations.

### Coverage

| Surface or journey | What was inspected | Confidence |
|---|---|---|
| First run / guide | Opening content, desktop and mobile layout, primary action, keyboard focus | Live + source |
| Explore | Whole graph, personal reflection highlight, mobile graph, legend structure, camera controls | Live + source |
| Path finding | Mobile preset from fear/anxiety to equanimity; labeled two-step result | Live + source |
| Display / thematic threads | Configuration and implementation | Source; not every combination exercised |
| Lineage | BG 2.47 desktop diagram and mobile list; Ladder of Fall selection | Live + source |
| Read | Chapter 2 desktop/mobile; small-phone reflow; chapter navigation and options | Live + source |
| Verse detail | BG 2.47 and 2.1; half/full mobile sheet; meaning, commentary, language/script options | Live + source |
| Commentary | BG 2.47 loaded, tradition/author attribution, visible punctuation issues | Live + source |
| Reflect | Empty state, intellectual idea, emotional example, mapping, save, history, graph handoff, draft loss | Live + source |
| Saved thought persistence | One saved synthetic entry remained after a later page navigation/reload | Live + source |
| Ask | Beginner question, follow-up, citations, Details/Ask switching, generated table formatting | Live + source |
| Search | Command menu and exact verse reference 2.47 | Live + source |
| Personal search, deletion, import | Implementation and available controls; no deletion or import performed | Source |
| Listen | Per-verse playback reached an active Pause state; source and playback options inspected; player stopped afterward | Live UI + source; audio fidelity not evaluated |
| Settings | Language model, Search, Appearance, Data; tablet layout | Live + source; no keys or preferences changed |
| Offline / failure / safety | Service worker, fallback, storage and crisis-handling code | Source; failure conditions not deliberately induced |

### Viewports and limits

Measured browser content viewports included **1309 × 818**, **355 × 767**, **390 × 844**, **320 × 640**, and **768 × 1024** CSS pixels. Browser scaling made requested viewport dimensions differ from the actual CSS viewport, so the sizes here come from `innerWidth`/`innerHeight` measurements.

Mobile inspection used a desktop browser resized to phone dimensions. It does not establish behavior on real iOS Safari or Android Chrome, with their virtual keyboards, touch input, screen readers, dynamic browser bars, or constrained GPUs. Light theme, every regional script, every commentary, and offline cold starts need further validation. Development performance is not a production benchmark.

One clearly labeled synthetic thought was saved in the audit browser to verify the personal graph. No real journal content was used. Two ordinary educational prompts were sent through the already configured companion. No application source was edited, credentials changed, database synced, or content published.

## 3. The intended human experience

The product should serve several reasons to arrive, without treating all of them as distress:

| User situation | Underlying need | What success should feel like |
|---|---|---|
| “I have never studied the Gita.” | A safe starting point and manageable depth | “I understood one idea and know what to do next.” |
| “Something happened today and I want to think.” | Expression without judgment | “My experience has a place, and I can choose how to explore it.” |
| “A verse made me question something.” | Interpretation, dialogue, intellectual permission | “I can ask, disagree, and record my own understanding.” |
| “I have an idea unrelated to scripture.” | Capture and personal ownership | “The idea is worth keeping before anyone classifies it.” |
| “I already study the text.” | Sources, traditions, cross-references | “I can investigate deeply without losing context.” |
| “I came back to something I wrote.” | Continuity and perspective | “I can see what stayed with me and what changed.” |

The app should support both devotional and philosophical relationships with the Gita. Sanskrit and traditional framing can remain central while the entry language is understandable to a beginner. Emotional difficulty must not become the price of entry.

### Intrinsic reasons to return

These are design hypotheses, not claims that the current app has demonstrated retention:

- **Ownership:** the original thought remains intact and easy to find; the person controls its connections.
- **Competence:** a short learning activity ends with an idea the person can explain in their own words.
- **Continuity:** earlier notes reappear at relevant moments, with the option to respond or revise.
- **Curiosity:** an unexpected, well-explained connection invites further exploration.
- **Emotional permission:** uncertainty, joy, disagreement, and unfinished ideas are welcome.

Avoid making streak counts, entry volume, or “healing scores” the central reward. They would be poor proxies for the user's intended benefit.

## 4. Preserve these strengths

1. **The graph is functional, not just decorative.** Saved thoughts are inserted as `PersonalThought` nodes with real edges. This is a valuable foundation.
2. **Multiple entry modes already exist.** Reading, asking, writing, and exploring can support different levels of familiarity.
3. **Local reflection mapping works without a model.** This can reduce setup barriers and protect privacy when its capabilities are described accurately.
4. **Citations open inspectable source material.** In the inspected Ask flow, a citation switched to Details and the conversation remained available.
5. **The mobile lineage list is a strong adaptation.** It makes relationships readable without requiring the desktop diagram's panning gestures.
6. **Author and tradition attribution exists.** Commentary distinguishes interpretive traditions; generated regional meanings are labeled as generated in the detail implementation.
7. **The visual identity has restraint.** Warm neutrals, saffron accents, serif reading text, and a dedicated Devanagari font suit reflective reading. Keep this foundation.
8. **Useful states are already present.** Loading feedback, disabled actions, empty reflection history, close controls, and some fallback behavior have been considered.
9. **Bottom navigation provides stable mobile destinations.** Preserve its visibility and thumb reach while improving the destinations' hierarchy.
10. **The player appears only after listening starts.** It does not consume permanent empty space.

## 5. Detailed findings

Evidence labels: **Observed** = reproduced in the UI; **Source** = verified in implementation; **Inference** = product interpretation; **Proposal** = new behavior to validate. Screenshots document the inspected build, not proposed screens.

### F01 · P1 · The opening explains the system before the benefit

**Observed:** The welcome headline is “The Bhagavad Gita as a knowledge graph.” Its body leads with 857 points and 5,350 lines, then five choices. The main action is “Start exploring.” On mobile, the action and privacy statement require scrolling through a long guide. Counts increase after a personal thought is added.

**Impact:** A beginner must decide between unfamiliar modes before experiencing value. Someone arriving with a thought is directed into a large graph.

**Change:** Lead with a human invitation: “A place for your thoughts, with the Gita to explore alongside them.” Offer “Save a thought,” “Understand a verse,” and “Ask a question.” Make the detailed graph guide optional. Show one short sample journey rather than explaining every feature upfront.

**Acceptance:** From a first visit at 320–390px width, a user can start one meaningful task without reading a feature catalog, choosing a provider, or learning graph terminology.

**Evidence:** [Mobile guide](evidence/11-mobile-guide.png); `Welcome.tsx:58–110`.

### F02 · P1 · Ordinary intellectual thoughts are misclassified

**Observed input:** “Audit example: Could a city be designed around cooperation rather than competition? I want to explore this idea.”

**Observed result:** Śānti, Kāma, and “Spiritual Doubt & Crisis of Faith”; BG 5.13 ranked first with “BM25 text match.” The reflection text said the writing echoes a situation the Gita addresses directly. The literal city language appears to have contributed to a weak connection to the verse's “nine-gated city”; that mechanism is an inference, not a confirmed explanation of the entire ranking.

**Source:** When direct emotion/dilemma routing finds nothing, `analyze()` falls back to retrieved categories, scales their normalized scores, and still presents them as personal matches. The available personal relationship types are FEELS, FACES, and RESONATES_WITH.

**Impact:** The user can feel misunderstood or judged. Incorrect suggestions contaminate the personal graph and its aggregate “patterns.” This conflicts directly with the requested intellectual-reflection use case.

**Change:** Start with the user's stated intent. Allow “idea,” “question,” “verse note,” or unrestricted writing without assigning a psychological category. Present candidates as possible connections, with a reason and “Does this fit?” Keep a valid no-clear-match state. Do not turn normalized retrieval scores into confidence about a person's emotional state.

**Acceptance:** A neutral or unrelated thought can be saved with no emotional labels and zero scripture edges. Suggested labels and edges can be accepted, removed, or replaced. Weak text overlap alone never creates an authoritative claim about the writer.

**Evidence:** [Actual neutral-thought result](evidence/01-desktop-neutral-thought.png); `PersonalMindMapper.tsx:24–54`.

### F03 · P1 · “Heavy” is preselected even when the person never reports distress

**Observed:** The input asks “How heavy does it feel?” and defaults to 3/Heavy. The neutral cooperation idea was saved with a heavy label.

**Impact:** The interface invents a self-report. Joyful, curious, and analytical writing receive an inappropriate emotional framing.

**Change:** Make emotional check-in optional and initially unanswered. Offer it for feelings-oriented writing, with words rather than unexplained numbers. Do not treat skipped input as an intensity value. Keep gratitude, curiosity, calm, and uncertainty equally valid.

**Acceptance:** Saving without using a check-in produces no heaviness metadata; summaries distinguish missing data from a user-selected value.

**Evidence:** [Mobile Reflect](evidence/07-mobile-reflect.png); `PersonalMindMapper.tsx:80, 214–229`; `types.ts:99`.

### F04 · P0 · Switching views loses an unfinished reflection

**Observed:** Typed “Audit draft: What does BG 2.47 mean by attachment to results?”, switched to Read, then returned to Reflect. The composer was empty.

**Source:** Composer text and analyzed draft live in component state. View changes unmount the component. No persisted writing draft was found.

**Impact:** Exploration—the product's intended behavior—can destroy writing. On a phone, interruption is an ordinary part of use.

**Change:** Persist drafts locally with a small debounce and clear “Draft saved on this device” feedback. Restore across navigation and reload. Make discard explicit. Handle storage failure visibly and keep unsaved text available.

**Acceptance:** Text survives changing tabs, opening a verse, refreshing, and returning after a browser restart where storage is available. A failure never silently clears the text.

**Sources:** `PersonalMindMapper.tsx:79–81`; conditional views in `app/page.tsx`.

### F05 · P0 · Saving can commit an older version of the text

**Source:** After Reflect creates `draft`, the composer remains editable. Its `onChange` updates `text`, while `keep()` saves `draft`. It does not reconcile or invalidate the draft when the visible text changes.

**Impact:** A user can correct a deeply personal sentence, tap Save reflection, and save the earlier sentence. This is a code-confirmed risk; a second saved entry was not created to reproduce it live.

**Change:** Make the latest writing the canonical saved content. Associate suggestions with an explicit text version; mark them stale or recompute when text changes. Save the writing successfully even if suggestions fail.

**Acceptance:** Analyze text A, edit to B, save: the entry contains B. No outdated analysis is represented as a confirmed interpretation of B. Repeated taps cannot create accidental duplicates.

**Sources:** `PersonalMindMapper.tsx:90–99, 136–142, 210`.

### F06 · P1 · Saving depends on an interpretive step

**Observed:** The initial primary action is Reflect; “Save reflection” appears only after mapping. There is no “Just save this thought” path.

**Impact:** The person must receive the system's interpretation before obtaining basic ownership and storage. A thought without a match appears incomplete.

**Change:** Make “Save thought” the dependable primary action. Offer “Explore connections” as an optional second step or after-save action. A saved unconnected thought is still a graph node.

**Acceptance:** A thought with no recognized vocabulary can be saved and found without generating categories, invoking a model, or selecting a verse.

**Sources:** `PersonalMindMapper.tsx:190–315`; `personalNode()` / `personalEdges()` in `graphStore.ts`.

### F07 · P1 · Saved reflections lack a usable detail and editing journey

**Observed + Source:** History shows a date, heaviness, three-line text preview, category/verse chips, and delete. The list item itself does not open the thought. There is no edit, append, title, search, or pinned entry flow. The graph inspector can show full personal text, but the history does not provide a direct route to that node. Stored generated reflection prose is not displayed in the history.

**Impact:** The app accumulates writing without making it easy to work with that writing. Users may struggle to recover a long thought or revisit the insight they saved.

**Change:** Add a thought detail destination with full original text, dates, accepted connections, an optional generated interpretation, edits/version history, and “Add a later reflection.” Make each history row open it. Provide simple local search before advanced filters.

**Acceptance:** Every saved thought can be reopened, read fully, edited, searched, and revisited directly from the list. Saving an interpretation does not make it inaccessible afterward.

**Sources:** `PersonalMindMapper.tsx:373–386`; `NodeInspector.tsx`; `types.ts:99–110`.

### F08 · P1 · Single-entry deletion has no recovery path

**Source:** A history trash button calls deletion immediately. There is no undo or trash store. Delete all has a confirmation, but uses a native browser dialog. No deletion was performed during this audit.

**Impact:** A small tap target on a phone can erase meaningful writing irreversibly through the current app flow.

**Change:** Add recoverable deletion and an accessible Undo action. Put bulk deletion in a deliberate data-management flow. Distinguish deleting an entry from removing a suggested connection.

**Acceptance:** Accidental single-entry deletion can be reversed through the product. Bulk deletion states what is removed and offers a backup path.

**Sources:** `PersonalMindMapper.tsx:145, 381, 432 onward`; `personalStore.ts:31–38`.

### F09 · P1 · There is no direct verse-to-personal-reflection bridge

**Observed:** Verse actions emphasize Listen, Lineage, Read/In graph, and Ask. There is no “My thought on this verse” action that starts a note with that verse attached.

**Impact:** Reading and personal meaning remain separate tasks. Users must manually copy or remember the verse and reconstruct context.

**Change:** Add “Reflect on this verse” with the verse reference attached as context, not as a compulsory endorsement. Support “I understand this as…,” “I disagree or feel unsure…,” and “This reminds me of…”. Keep the original writing separate from any AI paraphrase.

**Acceptance:** A note begun from BG 2.47 retains its origin and opens that verse from its detail. The user may remove the connection or mark it as a question/disagreement.

**Sources:** `VerseExplorer.tsx`; `PersonalThought` schema.

### F10 · P1 · Reading is extensive, but the learning loop is missing

**Observed + Source:** Read starts at chapter 2, presents a chapter summary and a long sequence of verses, and exposes many scholarly options. There is no beginner path, short lesson boundary, understanding check, bookmark, or persisted resume position in the reviewed implementation.

**Impact:** Access to information can be mistaken for progress in learning. A beginner may finish a page without feeling able to explain anything.

**Change:** Add a small “Start here” path and short units. Each unit should contain a question, brief narrative context, a verse with attributed translation, a plain-language explanation labeled as explanation, one example, and a prompt to restate or question it. Preserve the full reader for study.

**Acceptance:** A newcomer can complete one bounded activity, save an interpretation in their own words, and resume at the last meaningful location. Progress reflects activity completed or user judgment, not claimed spiritual attainment.

**Evidence:** [Desktop/mobile reading](evidence/05-mobile-reader.png); `ChapterReader.tsx:79–85, 143–205`; `useGitaStore.ts:115`.

### F11 · P1 · Mobile verse detail delays the meaning behind controls

**Observed:** At 355px width, the default 58%-height detail sheet showed its header, verse title, metre, speaker, action buttons, script options, and the beginning of Sanskrit. The English meaning was not visible. Even the expanded view placed meaning below a substantial control stack.

**Impact:** “What does this mean?” is more difficult than the secondary controls it depends on.

**Change:** Use a compact full-page or sufficiently tall mobile detail with a clear Back action. Put verse identification, a short meaning, and the primary learning/reflection action first. Put script, translator, metre, and advanced study tools behind labeled options. Preserve easy access to the original text and attribution.

**Acceptance:** On a typical 390px phone, opening a verse exposes a meaningful explanation/translation and one next action without first operating a sheet handle or scrolling past settings.

**Evidence:** [Half sheet](evidence/06-mobile-detail-half-sheet.png); `SidePanel.tsx:26–37, 74–101`.

### F12 · P1 · Small-screen reading and Ask overflow horizontally

**Observed:** At 320px, a reader scroll container measured **311px client width / 368px scroll width**. At 355px, the Ask message area measured **345px / 381px**. Long Sanskrit/transliteration sequences exceeded their text containers. Horizontal scrollbars were visible.

**Impact:** One-handed reading requires sideways movement, and users can lose their place. A scrollable inner pane can hide the problem from a document-width-only check.

**Change:** Fix wrapping in all script and answer surfaces; use `min-width: 0`, appropriate `overflow-wrap`, and language-aware breaking. At narrow widths, reduce the verse-number gutter and move it above the verse when needed. Do not simply clip the original text or hide overflow to conceal lost content.

**Acceptance:** Reading, writing, and answering fit 320, 355, 390, and 430px widths with no horizontal content scrolling. Full text remains available at enlarged text sizes. Test Sanskrit, IAST with diacritics, Hindi, and representative regional scripts.

**Evidence:** [Small reader](evidence/12-small-phone-reader.png), [player/reader](evidence/13-small-phone-audio.png), [Ask](evidence/08-mobile-ask-answer.png).

### F13 · P2 · The companion emits formats its renderer cannot handle

**Observed:** The follow-up “Can you give me a practical example of that distinction?” produced a Markdown comparison table that appeared as a paragraph of pipes and separator dashes.

**Source:** `RichText` supports headings, simple lists, quotes, inline formatting, and citations, but has no table parser.

**Change:** Define an output contract shared by prompts and rendering. Either support safe responsive tables, or request accessible compact examples using the formats actually implemented. Preserve safe text rendering and working citation chips.

**Acceptance:** The tested follow-up displays readable examples at phone widths. Unsupported formatting has a graceful fallback; it never exposes a wall of Markdown syntax.

**Sources:** `RichText.tsx`; `graphrag/prompts.ts`.

### F14 · P1 · Ask infers a feeling from an educational question

**Observed:** The prompt asking for a simple explanation of BG 2.47 began with “You are feeling the pull of cintā.” The follow-up again told the user they were feeling restless worry, although neither educational question disclosed a feeling.

**Impact:** A helpful explanation begins by making an unwarranted personal claim. This reinforces the application's narrow emotional framing.

**Change:** Distinguish intent: study, comparison, personal reflection, practical application, or uncertainty. Describe the text's themes without assigning them to the user. Acknowledge a feeling only when the person expresses it, and use tentative language when interpretation is appropriate.

**Acceptance:** “Explain BG 2.47” begins by explaining it. “I feel worried” may receive empathic acknowledgement. A question about grief in a literary context is not automatically treated as a disclosure.

**Sources:** live two-question Ask sequence; `GraphRagChatbot.tsx:118–135`; `prompts.ts`.

### F15 · P2 · Follow-up context reaches the model but not retrieval

**Source:** The last six messages are passed as history to the language model. Browser retrieval receives only the newest question. A follow-up such as “Why?” or “What about that?” does not explicitly carry forward the earlier verse as a retrieval seed.

**Observed limit:** The tested follow-up did remain on the earlier topic. Therefore this is an architectural reliability risk, not a reproduced conversational failure in this run.

**Change:** Resolve conversational references for retrieval using bounded, inspectable context: selected verse, active topic, and previous cited nodes. Provide a clear “About BG 2.47” context indicator that the user can remove.

**Acceptance:** Ambiguous follow-ups retrieve relevant prior sources and show what context is in use. Switching topics clears or revises that context appropriately.

**Source:** `GraphRagChatbot.tsx:118–135`.

### F16 · P1 · Ask has no durable handoff into personal knowledge

**Observed + Source:** An answer can open sources and show its subgraph. It cannot save a takeaway as a personal thought, attach a user response, or reopen a named conversation later. Chat messages use an in-memory store.

**Impact:** A useful insight can disappear on reload and never become part of the user's own knowledge space.

**Change:** Add “Save my takeaway” and “Reflect on this” rather than saving entire chats by default. Let users choose original question, selected source references, and their own summary. Offer opt-in conversation history with clear retention controls if later needed.

**Acceptance:** A person can save an insight from Ask with source context and find it later. Generated text is visibly separate from the person's own writing. No private conversation is silently retained indefinitely.

**Sources:** `GraphRagChatbot.tsx:30–38`; `SubgraphCitationChips.tsx`.

### F17 · P1 · Personal graph highlighting does not explain the personal connection

**Observed:** “See my reflections in the graph” showed the full network with a banner saying eight nodes were highlighted. The thought was not automatically opened in a readable card, and the reasons for its edges were not visible at that scale. The full graph remained visually dense on a phone.

**Impact:** The emotional payoff—“my thought belongs in this growing map”—is weak. A highlight is technically correct but difficult to interpret.

**Change:** Open a small “My map” neighborhood centered on the selected thought, with 0–5 labeled connections and readable cards. Use relation labels such as “I connected this to” or “Suggested connection.” Show an empty-but-valid thought node when no links exist. Offer Expand to the whole Gita as a secondary action.

**Acceptance:** The person can identify their thought, explain each visible connection, and remove an incorrect suggestion without navigating a dense global canvas. A list view provides equivalent access.

**Evidence:** [Personal graph](evidence/02-desktop-personal-graph.png), [phone graph](evidence/10-mobile-graph.png); `showInGraph()` and `graphStore.ts`.

### F18 · P1 · The personal graph cannot express the full intended meaning

**Source:** A personal thought can connect through emotion, dilemma, and verse matches. The stored model has no explicit concept links, links between thoughts, source-of-note context, question/disagreement relation, or distinction between a suggestion and a user-approved connection.

**Impact:** A philosophical question and an emotional disclosure are squeezed into the same model. The graph cannot faithfully represent the user's learning, associations, and evolving interpretation.

**Change:** Extend the personal model incrementally: writing type optional; source context; optional check-in; suggested and accepted connections; provenance; editable typed links to concepts, verses, and other thoughts; created/updated timestamps; optional later responses. Keep public scripture structure separate from user annotations.

**Acceptance:** Standalone ideas, verse notes, concept questions, thought-to-thought connections, and disagreements can all be represented without invented emotional metadata. Existing saved entries migrate without loss.

**Sources:** `types.ts:99–110`; `graphStore.ts` personal node/edge constructors.

### F19 · P2 · Aggregate charts imply personal insight from model suggestions

**Observed + Source:** After just one neutral entry, history displayed “Recurring states of mind” and “Chapters that speak to you.” These aggregates use mapped labels and retrieved verses, not explicit user endorsement or reading behavior. The neutral entry's irrelevant labels therefore became “patterns.”

**Impact:** Suggestion frequency can be mistaken for self-knowledge. Chapter matches can be mistaken for interest or progress.

**Change:** Name the measurement honestly: “Suggested themes in your saved thoughts,” if suggestions are included at all. Prefer accepted themes and user-authored revisits. Use date ranges and minimum meaningful history; do not claim recurrence after one entry. Show the entries that support every summary.

**Acceptance:** Charts distinguish reported feelings, accepted themes, inferred suggestions, and reading activity. A one-entry history does not imply a recurring psychological pattern.

**Sources:** `PersonalMindMapper.tsx` patterns calculation and history section.

### F20 · P1 · Privacy copy contradicts the optional model behavior

**Observed:** Welcome says reflections “never leave this browser.” Reflect more accurately says nothing is sent unless Deepen is chosen. The Deepen button's title explains that it sends the entry to the connected model, but this relies on a hover-style affordance. Ask has a footer explaining question transmission.

**Impact:** A person can form an absolute privacy expectation and later activate a vaguely named feature with different behavior.

**Change:** Use one consistent explanation: “Your thoughts are saved on this device. Optional AI features send the text you choose to the provider shown.” Before first AI use, present a concise inline disclosure with the destination, included content, and a clear choice. Name the action “Explore with AI” or similarly explicit wording. Preserve local save and local suggestions.

**Acceptance:** A mobile user understands the destination and scope before sending a private thought. Copy does not claim absolute local processing when optional remote processing exists. Provider history/context transmission is explained where relevant.

**Sources:** `Welcome.tsx:105`; `PersonalMindMapper.tsx:102–112, 198, 299`; `GraphRagChatbot.tsx` footer.

### F21 · P1 · Local privacy is not the same as reliable custody

**Observed + Source:** Reflections are in IndexedDB. Export/import exists as JSON. There is no user-facing backup status, device-transfer journey, sync, or storage-error recovery. `loadThoughts()` returns an empty list when reading fails; saving is not wrapped with a visible error path in the view.

**Impact:** A person may assume “saved” means recoverable across browsers or devices. Storage failure can resemble an empty account. Browser storage is subject to browser policies and user deletion.

**Change:** State “Saved on this device” accurately; explain browser/device scope when useful. Add visible save failure, backup status, readable export plus a validated portable backup, and a tested restore/merge flow. Consider persistent-storage requests and opt-in encrypted sync only after defining the privacy model. Plain JSON export must be described as an unencrypted file.

**Acceptance:** Failed save preserves the writing and exposes retry/export. A failed load is distinguishable from no entries. A backup can restore full text and approved links into a new browser. Never show a successful save before storage succeeds.

**Sources:** `personalStore.ts:8–55`; `PersonalMindMapper.tsx:136–142`. Browser storage behavior: [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

### F22 · P1 · Modal keyboard focus remains behind the welcome guide

**Observed:** Opened the guide from the brand button, then pressed Tab. Focus moved to the background Search button. DOM inspection reported `insideDialog: false` while the guide remained open.

**Source:** Dialog markup uses `aria-modal`, but the reviewed guide/settings/search implementations do not provide a shared focus trap, inert background, or focus restoration system.

**Change:** Use an accessible dialog primitive or implement initial focus, contained tab order, Escape, inert background, and return focus. Audit every overlay separately; a nonmodal desktop side panel should retain its own appropriate interaction model.

**Acceptance:** Keyboard focus enters a modal on open, stays within it, and returns to its trigger on close. A screen reader is not offered active background controls as if they were part of the modal.

**Evidence:** [Guide with background Search focused](evidence/11-mobile-guide.png). Reference: [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

### F23 · P2 · Touch targets prioritize compactness over comfort

**Measured at 355px:** Header icon targets were about 32 × 32px; heaviness numbers were about 28 × 28px. Bottom tabs were approximately 71 × 56px, which is a better starting point. The sheet expand handle is a 20px-high button in source.

**Impact:** Frequent or consequential actions require more precision than the bottom navigation. Users with reduced dexterity face extra friction.

**Change:** Adopt a 44–48px product target for frequent phone controls, including Save, Back, close, playback, and connection decisions. Enlarge the hit area without necessarily enlarging every icon. Avoid relying on hover to explain an action.

**Acceptance:** Primary touch flows work one-handed with comfortable target spacing. Verify the actual hit rectangles and overlap, including after text enlargement.

**Standards distinction:** 28px controls are not automatically a WCAG AA failure. [WCAG 2.2 minimum target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) uses 24px with exceptions; [enhanced target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) uses 44px with exceptions. This recommendation is intentionally more comfortable than the minimum.

### F24 · P2 · Navigation does not model a person's return journey

**Source:** Most destination state is written with `history.replaceState`. Back navigation is not maintained as a sequence of product destinations. Lineage has its own internal Back behavior; the other views do not share a common history model. Reading position is not persisted.

**Impact:** Browser Back may leave the app rather than retrace the person's exploration. A user who moved from thought → verse → explanation needs a reliable way back to the same thought and scroll position.

**Change:** Define meaningful navigation history and context restoration. Avoid adding history entries for cosmetic filters, but preserve major task transitions. Provide explicit Back to thought / Back to answer where it helps.

**Acceptance:** The main round trip restores the original entry and position. Browser/system Back closes an appropriate overlay or returns to the preceding destination predictably, without unexpectedly dropping the user out of the product.

**Sources:** `app/page.tsx:140–151`; `ChapterReader.tsx:79–85`; `SidePanel.tsx`.

### F25 · P2 · Personal writing is absent from global search

**Source:** The search index is built from public verses and `graphData`. Updating thoughts rebuilds graph structures but not the search index. Search's advertised result groups do not include personal thoughts.

**Impact:** A person can search the scripture more effectively than their own growing body of thought.

**Change:** Add a local personal index, clearly grouped as “My thoughts,” with text snippets, dates, and source context. Do not include private notes in remote search or AI context by default. Search should also allow a direct question when there is no match.

**Acceptance:** The saved cooperation idea can be found by a distinctive phrase. Results distinguish user text from scripture and model-generated text. Deletion and edits update the local index.

**Sources:** `useGitaStore.ts:155, 172–176`; `CommandPalette.tsx`.

### F26 · P2 · Language support is uneven between study surfaces

**Observed + Source:** Verse detail offers Hindi and generated regional meanings. The chapter reader renders English meanings and an English translator picker. Regional script changes transliteration of Sanskrit; it does not translate the meaning. Most application navigation and guidance remains English.

**Impact:** A user can choose a familiar script and still not understand the meaning. Language preference does not produce a coherent learning experience.

**Change:** Distinguish “Sanskrit script,” “Meaning language,” and “Interface language.” Make a selected meaning language consistent across reader, detail, and learning units. Persist preferences. Start with strong English/Hindi flows and validate additional languages with speakers and qualified content reviewers.

**Acceptance:** Choosing Hindi meanings produces Hindi meanings throughout the supported reading journey. Generated content stays clearly labeled. Script conversion is never described as a published translation.

**Sources:** `ChapterReader.tsx:15–25, 205`; `VerseExplorer.tsx` Translation component; `indic/scripts.ts`.

### F27 · P2 · Interpretive provenance and source quality need clearer presentation

**Observed:** Commentary attribution is a strength, but BG 2.47 commentary included visible question-mark punctuation artifacts and words joined at paragraph boundaries. The reader summary made strong interpretive claims in an unattributed explanatory voice. Reflection recommendations exposed “BM25 text match” as a reason.

**Impact:** Raw data and implementation language weaken credibility. A novice may confuse source text, translator choice, interpretation, graph curation, and an AI explanation.

**Change:** Keep these layers distinct and labeled: original verse; attributed translation; commentary/tradition; editorial explanation; user writing; AI suggestion. Repair source punctuation using evidence and reviewed transformation rules, without silently rewriting the teaching. Replace retrieval jargon with a human explanation of the proposed connection.

**Acceptance:** Users can tell who authored a passage and why it appears. Automated cleanup preserves source meaning and can be checked against provenance. The product does not imply that an algorithmic path is a universally agreed doctrinal progression.

**Evidence:** [Verse/commentary](evidence/03-desktop-verse-detail.png), [lineage](evidence/04-desktop-lineage.png); `VerseExplorer.tsx` Commentary; graph retrieval reason display.

### F28 · P2 · Wellbeing language needs editorial boundaries

**Observed:** Consumer labels include “Heals,” “antidote,” “afflictive,” and descriptions of states the Gita “diagnoses.” The emotional example's offline response called the writing despair and immediately surfaced a verse about abandoning duties. These are text and interpretation issues, not evidence of a medical diagnosis performed by the application.

**Impact:** Everyday uncertainty can feel pathologized. A verse detached from narrative and interpretive context can sound like a direct instruction about a real-life decision.

**Change:** Present the product as a reflective/learning companion. Use language such as “speaks to” or “a perspective to consider” for personal suggestions. Keep scriptural quotation intact and add context around it. Do not equate a Sanskrit category with a clinical condition or frame scripture as a guaranteed treatment. Review personal-advice prompts and sensitive examples with appropriate subject experts.

**Acceptance:** The product permits disagreement and does not direct major personal decisions solely from a verse match. Reflection wording is tentative and respectful. Safety resources are maintained and accessible; crisis handling is reviewed separately from ordinary reflection.

**Source-only limitation:** Existing crisis detection uses English regexes and a few Hindi expressions. It cannot establish intent, multilingual coverage, or safety completeness. This audit did not run crisis conversations or validate helpline availability and does not reproduce contact numbers.

**Sources:** `NodeInspector.tsx`; `GraphHud.tsx`; `graphrag/safety.ts`; `graphrag/prompts.ts`.

### F29 · P2 · Offline and failure promises exceed what this run verifies

**Observed + Source:** Welcome says everything works offline. The development app does not register its service worker; registration is production-only. The worker precaches the root and base data and caches other fetched data/assets. Remote recordings and uncached commentary are different from bundled base data. Speech fallback depends on platform capabilities. Some empty/error strings tell the end user to run a build command.

**Impact:** “Offline” is ambiguous: no model, no network, cached data, and a fully prepared installation are different states.

**Change:** Show precise availability: “Local answers,” “Saved for offline use,” “Needs connection,” or “Recording unavailable; device voice available.” Add a user-oriented recovery path. Verify production offline use after visiting all required surfaces and from a genuinely disconnected restart.

**Acceptance:** The installed app states what is available. Previously saved writing remains accessible without a model or network. Missing content has retry/fallback behavior rather than developer commands. Do not claim a production offline pass based on a development session.

**Sources:** `app/page.tsx` service worker registration; `public/sw.js`; `audioStore.ts`; `VerseExplorer.tsx:217`.

### F30 · P2 · Graph accessibility and device cost need an equivalent simpler mode

**Observed + Source:** The 3D graph is exposed as one image-like region with instructions to use search/legend. Individual nodes are not represented as an accessible interactive tree in that canvas. The renderer requests high-performance WebGL and defaults to rotation; source includes reduced-motion handling elsewhere, but a complete graph motion/device audit was not performed.

**Impact:** Search offers a partial alternative, but does not give everyone the same ability to inspect a personal neighborhood or relationship path. Older phones may pay a high cost before receiving value; this is a performance risk, not a measured failure here.

**Change:** Provide a first-class list or simple 2D neighborhood mode with equivalent node and edge actions. Load the global 3D graph only when requested in the proposed home flow. Honor reduced motion, pause animations when hidden, handle WebGL loss, and test real low-end hardware before optimizing based on guesses.

**Acceptance:** The user can inspect their thought and its connections without WebGL, a pointer, color recognition, or continuous motion. A production phone performance budget is measured and documented.

**Source:** `CosmicGraph3D.tsx:661 onward`; `SidePanel.tsx`; `LineageGraph2D.tsx` list adaptation.

### F31 · P2 · Settings serve the builder more clearly than the reader

**Observed:** The global status says “Groq connected” and exposes provider/model setup. Data settings lead to Neo4j URI, user, password, and Cypher export. Search settings explain embeddings and vector dimensions. Everyday reading, language, saved-thought backup, and privacy choices are less central.

**Impact:** A technically capable prototype can feel as if it requires technical setup, even when core features work locally.

**Change:** Separate everyday settings—language, reading size, appearance, privacy, backup—from Advanced integrations. Use “AI available” or a similarly clear state in ordinary navigation; reveal provider detail when it affects consent or troubleshooting. Keep BYOK available as an advanced option.

**Acceptance:** A nontechnical user can start and keep using the core product without choosing a model, entering an API key, or understanding a graph database. Advanced setup remains discoverable for those who want it.

**Evidence:** [Tablet settings](evidence/14-tablet-settings.png); `ByokSettingsModal.tsx`.

### F32 · P2 · The mobile reading/listening experience lacks comfortable control depth

**Observed + Source:** Per-verse listening reached an active player and source attribution was available in options. On phone widths, previous/next controls are hidden; elapsed time is hidden below the desktop breakpoint; the seek control is a very thin strip. Auto-advance and follow-along default to enabled.

**Impact:** The app gives little direct control over replaying a difficult verse or checking progress. Automatic following may move the reader while they are studying another passage.

**Change:** Offer an expanded accessible player with previous, repeat verse, next, duration, and a comfortable scrubber. Explain automatic following before it changes reading position, and retain a clear user preference. Distinguish recordings from synthesized voice at the point of playback.

**Acceptance:** A phone user can replay one verse, stop following, and know what is playing without opening a technical options panel. Real-device interruption and background playback tests are completed.

**Evidence:** [Phone player](evidence/13-small-phone-audio.png); `AudioDock.tsx`; `audioStore.ts`.

## 6. Proposed information architecture

This is a product proposal to prototype, not a claim that the current architecture is broken in every context.

| Destination | Purpose | What moves here |
|---|---|---|
| **Today** | One useful starting point or continuation | First thought, short lesson, resume, optional revisit |
| **Learn** | Read and understand the Gita | Beginner paths, full reader, verses, commentary, listening |
| **Reflect** | Capture and work with personal writing | Composer, My thoughts, search/filter, thought detail, revisits |
| **My map** | Understand relationships around personal and scriptural ideas | Personal neighborhood, accessible list, lineage, optional whole 3D graph |
| **Ask** | Dialogue with sources and a way to keep takeaways | Full mobile destination with return context; desktop side panel when useful |

Lineage becomes a relationship presentation inside My map or verse details rather than a second top-level graph destination. Preserve existing deep links through redirects or compatibility mapping. Test naming with people; “My map” may be clearer than “knowledge graph,” but this must be validated.

### Mobile home: a useful first screen

Suggested order:

1. A calm heading: “What would you like to explore today?”
2. Primary action: “Save a thought.” Supporting line: “A feeling, a question, or an idea.”
3. Secondary paths: “Learn one idea” and “Ask about the Gita.”
4. For returning users, resume the last activity or offer one relevant revisit.
5. A small invitation to see the map after there is something meaningful to show.

Avoid replacing the current app with a generic dashboard of daily scores, decorative quote cards, and streaks. The home screen should reduce decisions.

## 7. Target journeys and screen requirements

### A. Capture any thought

**Entry:** Today, Reflect, a verse action, or a saved Ask takeaway.

**Composer:** One visible label, comfortable text area, immediate local draft protection, optional title/type/check-in, and a stable Save thought action. Examples should include curiosity and gratitude as well as difficulty.

**After save:** “Saved on this device.” Show the original thought. Offer “Explore connections,” “Add another thought,” and “View my map.” Avoid requiring a verse suggestion to finish.

**Connection review:** Show at most a few candidates, each with plain-language reasoning and provenance. “Keep this connection,” “Doesn't fit,” and “Choose another” are explicit. “No clear connection yet” is a complete state.

**Thought detail:** Full text, source if any, accepted links, AI material separately identified, edit, later response, and recoverable deletion.

### B. Learn one idea

**Entry:** “Learn one idea” or a topic the user chooses. Offer a short beginner route without requiring a religious identity or study schedule.

**Unit:** Why this question matters → narrative context → source verse and translation → a concise explanation → one everyday example → “How would you put this in your own words?” → optional saved note.

**Completion:** Show what was explored and what the person wrote. Offer a next question or resume later. Do not require a quiz or claim mastery from a page view. Make a deeper-study route available at every point.

### C. Ask, inspect, keep

**Entry:** A question with optional verse/topic context.

**Answer:** Start with the actual question; explain briefly; cite sources; distinguish interpretation from quotation; offer further depth. Do not prescribe a feeling to the questioner.

**Source inspection:** Open a verse in a way that preserves the answer and return position. On phones this may be a separate detail destination; on desktop the current dock can remain useful.

**Keep:** “Save my takeaway” opens a personal note with source references, rather than copying an entire model answer into the user's voice.

### D. Understand the map

**Initial view:** One selected thought or verse, readable text, and a small number of explicitly named edges. Show whether a link is curated, inferred, or created by the user.

**Interaction:** Tap a related idea → understand the relationship → open source → return to the same map. Offer list and graph views with equivalent actions.

**Global reveal:** Expand to chapter, theme, and finally the full Gita. The full network becomes a discovery and presentation tool once there is a reason to explore it.

### E. Return and notice change

**Entry:** “Would you like to revisit this thought?” with the old writing and date. No guilt for missing days.

**Response:** “What feels the same?” / “What do you see differently?” / “I want to leave it as it is.” Preserve the earlier writing and append a dated response.

**Map:** Show the later thought connected to the earlier one with the user's chosen relationship. Do not infer improvement from lower word counts, positivity, or model-generated emotional labels.

## 8. Visual and interaction direction

Keep the current warm palette, Sanskrit support, and serif/sans division. The immediate work is hierarchy and readability, not a wholesale visual restyle.

| Element | Recommended direction |
|---|---|
| Primary phone text | Comfortable 16–18px reading/body defaults, checked with actual users; preserve user text scaling |
| Sanskrit | Generous line height; language-aware wrapping; no accidental clipping of marks |
| Secondary text | Reserve very small metadata for genuinely secondary information; do not hide privacy or save state in it |
| Primary action | One prominent action per task: save, continue learning, or ask |
| Advanced controls | Labeled disclosure rather than a wall of chips before the content |
| Color | Use the existing warm neutral/saffron system; combine color with shape and text for relationship types |
| Empty states | Show a doable action and inclusive example; do not imply that an unconnected thought has failed |
| Motion | Use motion to explain selection and a new connection; respect reduced motion and offer static equivalence |
| Desktop | Retain helpful side-by-side source/answer inspection; constrain text width and prevent the graph from becoming unreadable when the dock opens |
| Tablet | Audit the 768–1023px overlay behavior with reading and Ask open together; avoid a 400px panel making the remaining task unusable |

Do not treat every warm dark screen as a contrast failure. This audit did not measure every foreground/background combination. A dedicated contrast and text-enlargement pass remains necessary in both themes.

## 9. Adoption strategy and measurement

### A useful activation definition

Test activation as: **the person keeps one piece of their own thinking and can explain one useful connection or insight.** Saving a standalone thought also counts as successful capture; a Gita connection should never be forced to satisfy a metric.

Track the learning outcome and capture outcome separately, so an arbitrary combined metric does not distort the product.

### Proposed metrics

| Question | Metric or research signal |
|---|---|
| Can people start? | First useful action completion and time; abandonment point |
| Can they trust saving? | Save failures, draft recovery success, duplicate saves, recovery after interruption |
| Do connections fit? | User acceptance/removal of suggestions; qualitative reasons for rejection |
| Do they learn? | Ability to explain one idea in their own words; perceived usefulness; source comprehension |
| Does the map help? | Can the user explain a displayed edge and return to its source? |
| Does the personal space grow in value? | Reopened thoughts, meaningful revisits, edits, and self-selected new connections |
| Is privacy understood? | Can the person correctly explain local save, optional AI transfer, and backup scope? |

Do not send raw journals, prompts, full node labels, or emotional categories into analytics by default. Prefer local measurement or consented, content-free events. Decide exact retention and consent practices before implementation.

### Lightweight usability study

Recruit an initial 6–8 participants across beginners, occasional readers, regular students, and people interested in reflection. Include English/Hindi preference, lower digital confidence, and mostly mobile use. This is a directional round, not statistical validation. Include actual assistive-technology users in the accessibility work rather than treating a simulated test as equivalent.

Tasks:

1. Arrive cold and explain what this app is for.
2. Save an ordinary intellectual idea with no obvious Gita connection.
3. Open one verse and explain its meaning in your own words.
4. Save a question or disagreement about that verse.
5. Change views while writing, then recover the draft.
6. Reject an incorrect suggested connection and find the original thought.
7. Follow an Ask citation and return to the answer.
8. Explain what leaves the device and how to move writing to another device.

Proposed prototype gates: most participants complete capture unaided; no lost writing; every participant can decline a connection; at least 6 of 8 can explain one map edge; privacy misunderstanding prompts revision. Treat these as provisional decision rules, not current performance results.

## 10. Storytelling and the eventual product video

The strongest story is a person's thought becoming clearer and remaining theirs. The graph is the visual proof of connection near the end of that story.

### A 75–90 second narrative to storyboard later

| Time | Story beat | Screen proof required |
|---|---|---|
| 0–10s | “A day leaves us with thoughts we don't quite know where to put.” | A specific ordinary moment and a fragment of writing |
| 10–22s | The person saves a thought in their own words | Immediate save, visible custody, no mandatory emotional score |
| 22–38s | They choose to explore a possible connection | A relevant, explained suggestion; ability to decline |
| 38–53s | A short teaching opens a new question | Verse, attribution, concise explanation, user question |
| 53–66s | They write what it means to them | Their words remain separate from the explanation |
| 66–78s | The map shows a small understandable relationship | Thought → concept/verse, readable edge label |
| 78–90s | Later, they revisit it and add a new perspective | Dated revisit and a growing personal map |

Use a second short vignette to establish that a thought can be intellectual or joyful, and that it can remain unconnected. A product about reflection should not imply that every user is in distress.

### What the current build can honestly demonstrate

- Reading Sanskrit and attributed translations, inspecting commentary, and listening controls.
- Asking a question, opening citations, and seeing a retrieved subgraph.
- Mapping a reflection, saving it locally, and adding a personal node to the graph.
- Inspecting a verse's relationships and a causal chain.

### What should be implemented before presenting the target story as live product

- Immediate independent save, draft protection, editable thought details, and optional connection review.
- A reliable, readable personal neighborhood with standalone nodes.
- A verse-to-reflection route and saved Ask takeaways.
- A beginner learning unit and a dated revisit flow.

If a concept prototype is filmed before these exist, label it as a prototype. Do not claim improved mental health, guaranteed wisdom, clinical effectiveness, or complete offline operation based on this audit. The credible promise is a clearer way to keep and explore thoughts with inspectable teachings.

## 11. Delivery sequence

| Phase | Purpose | Scope | Exit condition |
|---|---|---|---|
| **1 · Protect writing** | Establish custody and trust | Draft persistence, latest-text saving, save failures, direct save, optional check-in, recoverable deletion | No lost/stale writing through the core interruption scenarios |
| **2 · Complete the personal loop** | Make the intended use case real | Thought details/edit/search, source context, accepted links, standalone nodes, small personal map | Capture → inspect source → return → revisit works on a phone |
| **3 · Make learning approachable** | Deliver a clear first benefit | Human-first entry, short learning unit, simple explanation, verse reflection, resume/bookmarks, Ask takeaway | Beginners can explain one idea and keep their own response |
| **4 · Broaden confidently** | Support adoption | Language consistency, actual device QA, accessibility, production offline tests, privacy/backup clarity, performance work | Real-device and user-study gates met |
| **5 · Tell the story** | Present what is working | A focused demo script using the verified journey | Every video claim has visible product evidence |

No calendar estimate is asserted without implementation sizing. Dependencies and concrete acceptance criteria are in [IMPLEMENTATION-HANDOFF.md](IMPLEMENTATION-HANDOFF.md).

## 12. Further validation required

- Actual iOS Safari and Android Chrome: writing keyboard, safe areas, system Back, browser bars, interrupted sessions, background audio, low-memory reloads.
- Touch/coarse-pointer graph behavior and low-end Android performance.
- Production build offline warm start and cold restart, including uncached commentary/audio and updated service worker behavior.
- Storage-denied/full/unavailable states, import validation, export/restore, concurrent tabs, large personal libraries, deletion recovery.
- Screen-reader announcements, focus order, modal containment, tab/radio keyboard conventions, reduced motion, contrast, 200% text scaling and 400% zoom/reflow as applicable.
- English/Hindi/Hinglish input, negation, quotations about feelings, joyful entries, unrelated intellectual thoughts, uncertain matches, and disagreement.
- Retrieval relevance and citation faithfulness using a reviewed evaluation set; model/provider failure and cancellation.
- Qualified editorial review of Sanskrit, translations, commentary provenance, metaphorical applications, and wellbeing-related framing.

## 13. References and source map

External guidance is used as a reference for the recommendations; it does not establish that every cited criterion was fully tested.

- [WAI cognitive guidance: understandable purpose and controls](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o1-understandable/): supports clearer entry points, conventional controls, and an understandable relationship between controls and content.
- [WCAG 2.2 target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) and [enhanced target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html): distinguish the 24px minimum criterion from the 44px enhanced criterion, including exceptions.
- [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): reference for focus entry, containment, background interaction, and restoration.
- [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria): supports distinguishing local storage from guaranteed permanent custody.

Key implementation files, relative to `D:\GitaGraph`:

| Concern | Files |
|---|---|
| App destinations and URL state | `src/app/page.tsx`, `src/lib/store/useGitaStore.ts` |
| Welcome and navigation | `src/components/layout/Welcome.tsx`, `TopNav.tsx`, `views.tsx` |
| Desktop dock / mobile sheet | `src/components/layout/SidePanel.tsx` |
| Personal writing and storage | `src/components/manas/PersonalMindMapper.tsx`, `src/lib/store/personalStore.ts` |
| Personal graph model | `src/lib/types.ts`, `src/lib/graph/graphStore.ts` |
| Search | `src/components/layout/CommandPalette.tsx`, `src/lib/graphrag/search.ts` |
| Reader and details | `src/components/reader/ChapterReader.tsx`, `VerseExplorer.tsx`, `PadacchedaLexicon.tsx` |
| Companion | `src/components/chat/GraphRagChatbot.tsx`, `RichText.tsx`, `SubgraphCitationChips.tsx` |
| Retrieval and wording | `src/lib/graphrag/engine.ts`, `router.ts`, `prompts.ts`, `safety.ts` |
| Graph presentations | `src/components/graph/CosmicGraph3D.tsx`, `LineageGraph2D.tsx`, `NodeInspector.tsx`, `GraphHud.tsx`, `SutraPathFinder.tsx` |
| Audio | `src/components/reader/AudioDock.tsx`, `src/lib/store/audioStore.ts` |
| Preferences and integrations | `src/components/settings/ByokSettingsModal.tsx`, `src/lib/store/settingsStore.ts` |
| Offline and design tokens | `public/sw.js`, `src/app/globals.css`, `src/app/layout.tsx` |

The existing implementation has considerable depth. The next product milestone should be judged by one dependable human journey through that depth: a person keeps a thought, understands something, chooses a connection, and can return to it.
