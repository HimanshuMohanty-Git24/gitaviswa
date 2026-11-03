<div align="center">

# GitaViśva · गीताविश्व

**The Śrīmad Bhagavad Gītā as a living knowledge graph.**
A 3D cosmic graph of all 700 verses, a 2D lineage manuscript, a synchronised recitation reader,
a hybrid GraphRAG companion (*Pārtha-Sārathi*) and a private, offline mind-mapper (*Manas-Darpaṇa*).

`Next.js 15` · `graphology` · `Orama` · `react-force-graph-3d` · `React Flow` · `Zustand + IndexedDB` · `BYOK: Groq · OpenRouter · xAI · OpenAI · Ollama`

</div>

---

## Contents

- [What it is](#what-it-is)
- [Quick start](#quick-start)
- [Works with zero keys, fully offline](#works-with-zero-keys-fully-offline)
- [Architecture](#architecture)
- [The knowledge graph](#the-knowledge-graph)
- [Data pipeline](#data-pipeline)
- [Hybrid GraphRAG](#hybrid-graphrag)
- [BYOK and `.env` dual persistence](#byok-and-env-dual-persistence)
- [Audio, scripts and languages](#audio-scripts-and-languages)
- [Neo4j](#neo4j)
- [HTTP API](#http-api)
- [Project structure](#project-structure)
- [Implementation notes and deviations](#implementation-notes-and-deviations)
- [Known limitations](#known-limitations)
- [Credits and licences](#credits-and-licences)

## What it is

| View | Name | What you can do |
| --- | --- | --- |
| 3D | **Explore** (*Viśvarūpa*) | The 18 chapters as amber hubs on a ring, every verse clustered around its chapter, and concepts, states of mind, characters and life situations drawn inward. The legend doubles as the filter; **Display** colours by type, chapter or Louvain community and toggles relationship families; **Find a path** traces the weighted shortest path between any two nodes (or a curated thematic thread). Hovering or selecting a node lights its neighbourhood; labels appear as you move closer. |
| 2D | **Lineage** (*Darśana*) | A focused diagram for any node: what leads to it on the left (the question or dilemma that triggered a verse, its speaker, the preceding verse), the focus card in the centre, and what follows on the right (answers, echoes, culminations, states it heals, concepts it defines), grouped under relation headings. On narrow screens it becomes a vertical list. Includes a causal-chain mode (e.g. the 2.62-63 *ladder of fall*). |
| Reader | **Read** (*Adhyayana*) | Chapter-by-chapter reading plus a verse panel: Devanagari / IAST / phonetic / seven regional scripts, five English and two Hindi translations, 16 commentaries across Advaita, Viśiṣṭādvaita, Dvaita, Śuddhādvaita and Kashmir Śaivism, guru–laghu scansion, and word-by-word padaccheda. Hovering a word lights up every verse that shares its stem. |
| Companion | **Ask** (*Pārtha-Sārathi*) | Available from every view. Ask philosophy, comparisons, or what is on your heart. Retrieval runs in the browser in tens of milliseconds and the exact subgraph used for the answer is highlighted on the canvas. Citations such as `[BG 2.47]`, `[Concept: …]` and `[Emotion: …]` are clickable. |
| Journal | **Reflect** (*Manas-Darpaṇa*) | Keep any thought in your own words — saved on this device (IndexedDB), with drafts that survive view changes and reloads. Connections to verses, concepts, states or other thoughts are optional: suggestions explain themselves and only the ones you keep are saved (with status and provenance). Thoughts can be edited (earlier wording kept), answered later, searched, restored from Recently deleted, seen on a small personal map, and exported or imported. |
| Player | **Listen** (*Śravaṇa*) | Recitation player that appears once you press Listen: per-verse chanting, whole-chapter recordings, auto-advance, speed control, Media Session support. The 3D camera and the reader glide along with the chant. |

**Design system.** Tokens, type roles, the radius and z-index scales and component classes are documented at the top of `src/app/globals.css`; node-kind colours and shapes live in `src/lib/graph/palette.ts` (three categorical hues validated for colour-blind separation in both themes, with shape and size as secondary channels). The interface follows the system theme unless you pin one.

## Quick start

```bash
npm install          # Node ≥ 20 (developed on Node 26)
npm run data         # download open data → compile & verify the graph (resumable, cached in .cache/)
npm run dev          # http://localhost:3000
npm test             # behavioural checks for saving, migration, search and Ask rules
```

Optional:

```bash
npm run data:embeddings   # adds 384-d vectors → hybrid BM25 + vector search (downloads a ~23 MB model once)
npm run data:verify       # re-run integrity checks on public/data
cp .env.example .env.local   # or use Settings (gear icon, top right) in the app
```

`npm run data` is idempotent. Sources are cached in `.cache/sources/`, so later runs (or `npm run data:offline`) need no network. The compiled artefacts in `public/data/` are committed-ready, so a fresh clone can skip straight to `npm run dev`.

## Works with zero keys, fully offline

With no API key, everything except LLM-written prose still works: the 2D/3D graph, path finding, Louvain colouring, reader, all scripts, commentaries, search, the Reflect mapping, and Ask itself. Without a key it composes **deterministic answers from the retrieved subgraph**: the matched state or situation, the most relevant verses with the reason each was retrieved, any causal chain involved, and a contemplation. In production builds a service worker caches the app shell and data once visited; commentaries and recordings that were never opened need a connection, and recitation falls back to the platform speech engine. Your saved thoughts never depend on the network.

## Architecture

```mermaid
flowchart LR
  subgraph Build["scripts/ (Node, build time)"]
    S1[gita/gita · mirrors · vedicscriptures] -->|parallel ranged, resumable| C[.cache/sources]
    A1[archive.org chapter audio] --> C
    C --> K[build-gita-knowledge-graph.mjs<br/>clean · IAST · chandas · speakers ·<br/>ontology · curated layers · 84 anchors · integrity]
    K --> V[gita-verses.json]
    K --> G[gita-graph.json]
    K --> Q[gita-cypher-seed.cypher]
    K --> CM[commentary/BG_c.v.json ×701]
    V & G --> E[build-embeddings.mjs] --> EM[gita-embeddings.json]
  end
  subgraph Browser["Browser (zero-latency)"]
    V & G --> ST[Zustand store]
    ST --> GR[graphology MultiDirectedGraph<br/>+ weighted undirected projection]
    ST --> OR[Orama BM25 / hybrid index]
    GR & OR --> RAG[GraphRAG engine<br/>route → search → 2-hop → rank → subgraph]
    RAG --> UI3[CosmicGraph3D] & UI2[LineageGraph2D] & CH[Pārtha-Sārathi] & MD[Manas-Darpaṇa]
    MD <--> IDB[(IndexedDB)]
  end
  subgraph Server["Next.js route handlers"]
    CH -->|context + BYOK key| API[/api/chat] --> P[Groq · OpenRouter · xAI · OpenAI · Ollama]
    SET[/api/settings/env] <--> ENV[(.env.local)]
    EMB[/api/embed] --> TF[transformers.js · MiniLM]
    NEO[/api/neo4j] --> N4J[(Neo4j)]
  end
```

## The knowledge graph

**857 nodes · 5,350 relationships · 0 integrity errors**

| Label | Count | Notes |
| --- | ---: | --- |
| `Chapter` | 18 | Sanskrit name, yoga title, meaning, summaries (EN/HI), chapter recordings |
| `Verse` | 701 | 700 canonical + 13.1 (see [numbering](#implementation-notes-and-deviations)) |
| `Character` | 16 | speakers (Krishna 574 · Arjuna 86 · Sañjaya 31 · Duryodhana 9 · Dhṛtarāṣṭra 1) and persons named, including the lineage of the teaching (Vivasvān → Manu → Ikṣvāku, 4.1) |
| `SanskritConcept` | 67 | Dharma, Niṣkāma-karma, Ātman, Brahman, Māyā, Prakṛti/Puruṣa, the guṇas, Sthitaprajña, Samatva, Abhyāsa, Vairāgya, Śaraṇāgati… in eight categories |
| `Emotion` | 33 | 22 afflictive (Viṣāda, Moha, Bhaya, Krodha, Kāma, Lobha, Ahaṅkāra…) and 11 healing (Śānti, Abhaya, Śraddhā, Karuṇā, Prasāda, Dhṛti…), each with a modern parallel and an everyday lexicon |
| `LifeDilemma` | 22 | Duty vs. attachment, outcome anxiety, burnout, bereavement, imposter syndrome, toxic people, restless mind, leadership ethics, svadharma, addiction, guilt, loneliness… |
| `PersonalThought` | yours | client-side only; connections as `CONNECTS_TO`, `ASKS_ABOUT`, `QUESTIONS`, `REMINDS_OF`, `RESPONDS_TO` (suggested ones drawn faint). Never used to rank public retrieval and never included in a model's context. |

Relations (count): `MENTIONS_CONCEPT` 1221 · `BELONGS_TO` 701 · `SPOKE` 701 · `NEXT_VERSE` 700 · `MENTIONS_STATE` 403 · `DEFINES_CONCEPT` 359 · `MENTIONS_CHARACTER` 229 · `ANSWERS_QUESTION_IN` 197 · `ADDRESSES_DILEMMA` 150 · `HEALS` 115 · `DEPICTS_STATE` 92 · `CULTIVATES` 67 · `RESOLVED_THROUGH` 65 · `EXPOUNDS` 64 · `ECHOES_VERSE` 64 · `CULMINATES_IN` 63 · `EVOKES_STATE` 51 · `ANTIDOTE_TO` 44 · `CAUSES_STATE` 32 · `NEXT_CHAPTER` 17 · `NARRATED` 10 · `ADDRESSES` 5.

### Curated layers (in `scripts/ontology/`)

- **Dialogues** (`ANSWERS_QUESTION_IN`): 20 question→answer arcs, e.g. Arjuna's collapse 1.28–46 → 2.11–30; *sthitaprajña* 2.54 → 2.55–72; action vs knowledge 3.1–2 → 3.3–9; the restless mind 6.33–34 → 6.35–36; beyond the guṇas 14.21 → 14.22–27. It closes with 18.73 resolving 2.7.
- **Causal chains** (`CAUSES_STATE`): the 2.62–63 ladder of fall (*viṣaya-dhyāna → saṅga → kāma → krodha → sammoha → smṛti-vibhrama → buddhi-nāśa → praṇāśa*), the 2.64–66 ladder of ascent, 3.37, the threefold gate of 16.21, 14.17, 4.39, 4.40, 12.12, Arjuna's collapse, and 18.53–54.
- **Sūtra threads** (`ECHOES_VERSE`, `CULMINATES_IN`): 14 thematic progressions, e.g. 2.47 → 3.19 → 5.10 → 18.48 → 18.66.
- **Antidotes** (`ANTIDOTE_TO`): 44 healer→affliction links, each grounded in a verse.

## Data pipeline

`scripts/build-gita-knowledge-graph.mjs` (about 1.5 s once sources are cached):

1. **Resilient fetching** (`scripts/lib/net.mjs`). Mirrors are tried in order: raw.githubusercontent → github.com/raw → jsDelivr → `praneshp1org/Bhagavad-Gita-JSON-data` → per-śloka `vedicscriptures/bhagavad-gita`. Small files use gzip. Large files (`commentary.json`, 27 MB) use 16 parallel HTTP-Range streams, and each chunk is length-checked and persisted, so interrupted runs resume. Every payload must parse and validate before it is cached.
2. **Cleaning.** Speaker headings are separated (including fused `श्रीभगवानुवाच`; narration such as `तमुवाच` in 2.10 is not a heading). Source encoding quirks are repaired (an i-mātrā typed after the virāma, e.g. `भक्ितयोगेन` → `भक्तियोगेन`). Daṇḍas are normalised per line.
3. **Linguistics.** Strict **IAST** is generated from Devanagari alongside the source's phonetic transliteration. **Chandas** comes from guru–laghu scansion of every pāda: 646 Anuṣṭubh and 55 Triṣṭubh/Jagatī (Upajāti, Indravajrā, Upendravajrā), which matches the traditional 645 + 55 once the extra 13.1 is counted. **Padaccheda** chips carry approximate stems for shared-root lookup.
4. **Speakers.** Uvāca headings carry forward. Curated overrides cover Duryodhana's speech (1.3–11, narrated by Sañjaya) and the shared verse 1.21.
5. **Ontology matching.** Sandhi-aware Devanagari patterns with lookbehinds for false friends (`उभय` "both" ≠ `भय` "fear"; `कन्दर्प` ≠ `दर्प`; `परन्तप` ≠ `तपस्`), word-level padaccheda matchers for vowel-initial words hidden by sandhi, and gloss checks for homographs (*veda* "knows" vs *Veda*).
6. **Integrity.** The build will not write output unless all of these hold: 84 textual **anchor assertions** (every curated reference must contain the expected Sanskrit, which catches numbering drift); no dangling edges; exactly one `SPOKE` per verse; 18 chapters; per-chapter verse counts; no isolated ontology node; every dilemma with ≥ 4 verses.

## Hybrid GraphRAG

`src/lib/graphrag/engine.ts` is isomorphic: the browser runs it for zero-latency highlighting, and `/api/chat` and `/api/graphrag` run it server-side for API clients.

1. **Seeding.**
   - Deterministic semantic routing (`router.ts`): curated lexicons map everyday language onto Emotion, LifeDilemma, Concept and Character nodes, and verse references such as "2.47" or "2.55-72" are detected.
   - Orama BM25 runs over ASCII-folded IAST, three English translations, padaccheda glosses and every entity description. When embeddings exist it switches to hybrid BM25 + cosine. A query containing Devanagari is matched by direct scan.
2. **2-hop traversal.** `graphology-traversal` BFS over the weighted projection. Hubs are reached but not expanded, and each node is credited by its strongest relation (`HEALS` and `ANTIDOTE_TO` outweigh lexical mentions), damped by depth and degree.
3. **Ranking and subgraph.** The engine selects the top verses, concepts, states and dilemmas, plus the causal chains and dialogues that touch them, then extracts the induced subgraph. That subgraph is what the canvas lights up and what the LLM is allowed to cite.

Measured on the dev server: BM25 search takes 0.3–2 ms and full retrieval 7–45 ms. For example, *"I feel overwhelmed by expectations at work…"* → Viṣāda, Cintā, Bhaya; Duty vs. Attachment; BG 18.66, 2.40, 2.47, 2.48, 2.31, 2.50; chain *Arjuna's Collapse*.

**Care:** crisis language (self-harm, suicide) is detected in both the companion and the journal, and helplines are shown first (India: Tele-MANAS 14416; worldwide: findahelpline.com). Pārtha-Sārathi is a contemplative companion, not a substitute for professional care.

## BYOK and `.env` dual persistence

Open **Settings** (the gear icon in the top bar; its dot shows whether a model is connected) and choose **Language model**.

- **Detected automatically:** keys in `.env.local`, `.env` or the environment show a green **"Connected via .env"** badge (masked, e.g. `gsk_…abcd`). You never type them.
- **Saved twice:** a key entered in the modal is stored in `localStorage` and POSTed to `/api/settings/env`, which upserts `.env.local` (preserving other lines, written atomically) and updates `process.env` live. It survives restarts and cleared browsers.
- **Providers:** Groq (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`), OpenRouter (one-click **free** presets: `meta-llama/llama-3.3-70b-instruct:free`, `google/gemma-3-27b-it:free`, `deepseek/deepseek-r1:free`), xAI (`grok-2-latest`), OpenAI (`gpt-4o-mini` / `gpt-4o`), and local **Ollama** (`http://localhost:11434`). Any model id can be typed; the modal lists the models your key can actually use (live from the provider's `/models`), flags unavailable ones, and **Test** does a live round-trip.
- **Retired models never strand you:** providers retire models (Groq dropped the Llama 3.x line in 2026). If the configured model is gone, the server picks the best available one, remembers the substitution, reports it in an `X-GitaViswa-Model-Fallback` header, and the companion shows a note and adopts the working model in the browser.
- **Security model:**
  - Writes only from loopback with a same-origin `Origin` header (CSRF guard), and only in `next dev` unless `GITAVISWA_ALLOW_ENV_WRITE=true`.
  - Only whitelisted variable names are accepted, and values with whitespace, quotes or `$` are refused (no newline injection). Keys are never returned to the browser.
  - Custom LLM base URLs and Neo4j credentials are honoured only for local requests, so a deployment cannot be used as an open relay.
  - `.gitignore` excludes `.env` and `.env.local`; `.env.example` is provided.

## Audio, scripts and languages

- **Recitation:** per-verse Sanskrit chanting streams from holy-bhagavad-gita.org (`/media/audios/CCC_VVV.mp3`, same 701 numbering). Whole-chapter recordings come from archive.org (two collections, used as fallback mirrors). In chapter mode the active verse is estimated from syllable-proportional offsets and marked "≈ synced". When offline or on error, the platform's Sanskrit/Hindi speech voice is used.
- **Scripts (offline, instant):** Devanagari, IAST, phonetic, and transliteration into Bengali, Gujarati, Odia, Tamil (with Grantha-style superscripts for aspirates), Telugu, Kannada and Malayalam.
- **Translations:** five English and two Hindi translations ship with the data. Marathi, Odia, Bengali, Gujarati, Tamil, Telugu, Kannada and Malayalam meanings are generated on demand by your LLM and cached in IndexedDB.

## Neo4j

- `public/data/gita-cypher-seed.cypher` contains constraints plus batched `UNWIND … MERGE` statements. Run it in Neo4j Browser, or with `cypher-shell -f public/data/gita-cypher-seed.cypher`.
- **One-click sync:** Settings → Data → Sync now (or `POST /api/neo4j`) merges the whole graph through `neo4j-driver` with parameterised batches. Set `NEO4J_URI`, `NEO4J_USER` and `NEO4J_PASSWORD`, or enter them in the modal.

```cypher
// The ladder of fall, with its grounding verses
MATCH p = (:Emotion {id:'emotion:vishaya-dhyana'})-[:CAUSES_STATE*]->(:Emotion {id:'emotion:pranasha'}) RETURN p;
// Verses that heal anxiety and the concepts they define
MATCH (v:Verse)-[:HEALS]->(:Emotion {id:'emotion:bhaya'}), (v)-[:DEFINES_CONCEPT]->(c) RETURN v.label, v.translation_en, collect(c.label);
```

## HTTP API

| Route | Purpose |
| --- | --- |
| `POST /api/chat` | Streaming completion for `{mode: chat \| bridge \| translate \| analyze, provider, model?, question, context?, history?}`. The key comes from the `x-gitaviswa-key` header (BYOK) or `.env`. Without `context`, retrieval runs server-side. Errors return JSON `{error, code}`. |
| `GET /api/graphrag?q=` | Keyless retrieval: ranked nodes, subgraph size, LLM-ready context and the offline answer. |
| `GET/POST/DELETE /api/settings/env` | Provider status (masked), write or remove keys in `.env.local`. |
| `POST /api/settings/test` | Live provider round-trip. |
| `GET /api/settings/models?provider=` | Chat models available to the key, plus a recommended pick. |
| `POST /api/embed` | Local MiniLM sentence embeddings (503 if unavailable). |
| `POST /api/neo4j` | One-click graph sync. |

Deep links: `/?view=darshana&node=BG_2.47`, `/?view=adhyayana&chapter=2`, `/?ask=How%20do%20I%20handle%20anger%3F`.

## Project structure

```text
public/data/            gita-verses.json · gita-graph.json · gita-cypher-seed.cypher · commentary/ · (gita-embeddings.json)
public/sw.js            offline service worker
scripts/
  build-gita-knowledge-graph.mjs   fetch → compile → verify → write
  build-embeddings.mjs · verify-graph.mjs · prefetch-sources.mjs
  lib/       net.mjs (resilient fetch) · sanskrit.mjs (IAST, chandas, padaccheda) · sources.mjs · verify.mjs
  ontology/  concepts · emotions (+ chains, antidotes) · dilemmas · characters · curated (dialogues, threads, anchors)
src/
  app/                 layout (fonts) · page (workspace) · globals.css (sacred tokens) · api/{chat,graphrag,settings/env,settings/test,embed,neo4j}
  components/
    sacred/            the brand mark (18-petal lotus within the Sudarshana chakra)
    ui/                shared primitives: NodeGlyph · PanelHeader · SectionLabel · EmptyState · Notice
    graph/             CosmicGraph3D · LineageGraph2D · SutraPathFinder · LensPanel · NodeInspector · NodePicker · GraphHud
    reader/            VerseExplorer · PadacchedaLexicon · ChapterReader · AudioDock
    chat/              GraphRagChatbot · SubgraphCitationChips · RichText
    manas/             PersonalMindMapper
    settings/          ByokSettingsModal
    layout/            TopNav + MobileTabBar · views (names & purposes) · SidePanel (RightDock: details / Ask) · CommandPalette (⌘K, /) · Welcome guide
  lib/
    graph/             graphStore (graphology) · pathfinder (Dijkstra) · communities (Louvain) · relations
    graphrag/          engine · search (Orama) · router · citations · prompts · safety · text
    llm/               providers · client (server, SSE) · browser
    store/             useGitaStore · settingsStore · audioStore · personalStore (IndexedDB)
    indic/             regional-script transliteration
    server/            data cache · .env.local writer · localhost guard
```

## Implementation notes and deviations

- **Numbering:** the source dataset has **701** entries. It includes 13.1 (*prakṛtiṃ puruṣaṃ caiva…*, Arjuna's question), which some recensions print and the traditional count of 700 omits. It is kept as `BG_13.1` with `canonical: false`, and chapter 13 follows this numbering (Gita Press 13.n = here 13.n+1), as the per-verse audio does. Speaker totals therefore read Arjuna 86 (85 + 13.1) and Sañjaya 31 + 10 narrated. 1.21 is credited to Arjuna with Sañjaya's half-line recorded as `NARRATED`.
- **Fallback repositories:** the two fallback URLs in the brief (`kashyap07/…`, `praneshp1org/…/bhagavad_gita.json`) return 404. Working mirrors of the same dataset (`praneshp1org/Bhagavad-Gita-JSON-data/{verse,translation,commentary,chapters}.json`) and the per-verse `vedicscriptures/bhagavad-gita` are used instead.
- **Audio URL:** the pattern `/public/audio/{c}_{v}.mp3` from the brief returns 404 and the IITK URLs return HTML. The verified endpoint is `https://www.holy-bhagavad-gita.org/media/audios/CCC_VVV.mp3`.
- **Embeddings:** `@huggingface/transformers` (the official successor of `@xenova/transformers`, same `pipeline` API) is used as an optional dependency. `@xenova/transformers` pins `sharp@0.32`, whose install script must download libvips from GitHub, and that is blocked by npm 12's default install-script policy and was unreliable on the build network.
- **Security override:** `package.json` overrides Next 15's bundled `postcss` to `^8.5.32` to clear GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849, GHSA-fxqj-rqcc-2cmp and GHSA-qx2v-qp2m-jg93 without moving to Next 16 (`npm audit`: 0 vulnerabilities).
- The **React Flow attribution** is kept visible (styled quietly), per its licence request.

## Known limitations

- Lexical concept and emotion edges are heuristic (precision-tuned, not exhaustive). The curated `DEFINES`, `HEALS`, `DEPICTS`, dialogue and thread edges are the authoritative layer.
- Padaccheda stems are approximate (suffix stripping on the source transliteration), labelled "stem" and not "dhātu".
- Chapter-recording sync is estimated, and the two archive.org recordings differ in pacing.
- 11.19 has no word-by-word glosses in the source.
- Per-verse audio is streamed from a third-party site and needs network access (speech synthesis is the offline fallback).
- Reflect suggestions use English lexicons; Hindi and Hinglish writing is saved normally but rarely receives suggestions yet.
- The "Start here" lesson explanation and example are editorial drafts awaiting expert review.
- Thoughts stay in one browser on one device; there is no sync (use Export / Import to move them).

## Credits and licences

- Text, transliteration, word meanings, translations and commentaries: [The Gita Initiative — gita/gita](https://github.com/gita/gita) (Unlicense), mirrored by [praneshp1org/Bhagavad-Gita-JSON-data](https://github.com/praneshp1org/Bhagavad-Gita-JSON-data); supplemental source [vedicscriptures/bhagavad-gita](https://github.com/vedicscriptures/bhagavad-gita) (GPL-3.0).
- Recitations: [holy-bhagavad-gita.org](https://www.holy-bhagavad-gita.org) (streamed, not redistributed) and the Internet Archive's *[Bhagavad Gita Chanting](https://archive.org/details/bhagavad-gita-chanting)* collections.
- Translators and commentators retain their respective rights; see each item in the dataset.
- Code: MIT.

<div align="center"><sub>ॐ पूर्णमदः पूर्णमिदम् — composed with reverence.</sub></div>
