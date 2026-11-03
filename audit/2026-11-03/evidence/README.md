# Audit evidence index

Screenshots are from the live application at `http://localhost:3000` on 3 November 2026. They show the existing implementation, not proposed designs. Phone views were browser viewport tests on a desktop environment, not physical-device captures. Some screenshots include the Next.js development indicator; that overlay is not treated as a production product defect.

| File | What it supports | Relevant findings |
|---|---|---|
| [01-desktop-neutral-thought.png](01-desktop-neutral-thought.png) | An intellectual cooperation/city idea produced emotional labels, crisis-of-faith categorization, and raw retrieval reasons | F02, F27 |
| [02-desktop-personal-graph.png](02-desktop-personal-graph.png) | Saved synthetic entry highlighted eight nodes within the global graph | F17 |
| [03-desktop-verse-detail.png](03-desktop-verse-detail.png) | Desktop verse/detail and commentary surface | F11, F27 |
| [04-desktop-lineage.png](04-desktop-lineage.png) | BG 2.47 lineage with the commentary dock open; limited room for diagram labels | F17, F27 |
| [05-mobile-reader.png](05-mobile-reader.png) | Mobile chapter introduction and reading toolbar | F10, F11 |
| [06-mobile-detail-half-sheet.png](06-mobile-detail-half-sheet.png) | Half-height mobile details show controls before meaning | F11 |
| [07-mobile-reflect.png](07-mobile-reflect.png) | Initial reflection composition and default Heavy setting | F03, F06 |
| [08-mobile-ask-answer.png](08-mobile-ask-answer.png) | Answer reading area, long transliteration overflow/scrollbar, source handoff controls | F12, F16 |
| [09-mobile-lineage.png](09-mobile-lineage.png) | Mobile list adaptation of verse relationships | Strength to retain; F17 |
| [10-mobile-graph.png](10-mobile-graph.png) | Dense whole graph on a phone, with an isolated citation highlight | F17, F30 |
| [11-mobile-guide.png](11-mobile-guide.png) | Long welcome dialog; background Search visibly focused after Tab | F01, F22 |
| [12-small-phone-reader.png](12-small-phone-reader.png) | 320px reader and horizontal scrollbar | F12 |
| [13-small-phone-audio.png](13-small-phone-audio.png) | 320px reading with an active player and horizontal overflow | F12, F32 |
| [14-tablet-settings.png](14-tablet-settings.png) | 768px tablet settings; Appearance inspected without changing preference | F31 |

## Behavioral evidence without a screenshot

- **Draft loss:** Typed `Audit draft: What does BG 2.47 mean by attachment to results?`; switched to Read; returned to Reflect; the textarea had no value. Component-state-only storage corroborates the observation.
- **Save result:** One saved synthetic cooperation idea appeared in history, increased My reflections to one, and remained after later navigation/reload. It was automatically labeled heavy.
- **Raw Markdown:** Ask follow-up `Can you give me a practical example of that distinction?` rendered a table as pipes/dashes in ordinary paragraph text. The answer renderer has no table support.
- **Personal inference:** The beginner explanation question and follow-up each asserted the writer was experiencing worry, despite the prompts being educational.
- **Focus escape:** With the welcome guide open from the brand button, pressing Tab focused Search. DOM observation returned `insideDialog: false`.
- **Reflow measurements:** Reader at 320px: inner scroll container `clientWidth=311`, `scrollWidth=368`. Ask at 355px: message scroller `clientWidth=345`, `scrollWidth=381`.
- **Touch measurements:** Header controls around 32px square; heaviness choices around 28px square; bottom navigation around 56px high.
- **Path:** Fear/anxiety to equanimity produced two labeled steps through Fear of Failure & Outcome Anxiety. Algorithmic path quality is not a clinical or doctrinal validation.
- **Audio:** Per-verse listening reached Pause/active playback UI; options identified the recording source. Sound fidelity and background-device behavior were not evaluated. The player was stopped afterward.

## Observed test prompts

1. Neutral thought: `Audit example: Could a city be designed around cooperation rather than competition? I want to explore this idea.`
2. Emotional example, not saved: `Audit example: I feel overwhelmed by expectations at work and afraid of letting my family down.`
3. Ask: `Explain BG 2.47 in simple words for someone new to the Gita. How can effort matter if I should not focus on results?`
4. Follow-up: `Can you give me a practical example of that distinction?`

No real journal writing was used. Source-confirmed concerns such as stale saves and immediate deletion were not deliberately exercised by overwriting or deleting entries. See the main report for the distinction between observed findings, source findings, and product hypotheses.
