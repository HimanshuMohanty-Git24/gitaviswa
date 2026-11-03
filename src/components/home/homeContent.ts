/**
 * Static content for the home page, so it paints before the 3 MB of verse data arrives.
 * Sanskrit, IAST and translations are copied verbatim from public/data/gita-verses.json
 * (English: Swami Adidevananda, author 18). Speaker prefixes ("The Lord said") are dropped for display.
 * The one-line glosses are editorial paraphrases, shown as such, never as translation.
 */

export const HOME_TRANSLATOR = "Swami Adidevananda";

export interface HomeVerse {
  id: string;
  ref: string;
  sa: string[];
  iast: string[];
  en: string;
  /** Chip label in the verse switcher. */
  theme: string;
  /** Editorial one-liner. */
  gloss: string;
}

/** The verse switcher: BG 2.47 first, then other lines people carry with them. */
export const SPOTLIGHT: HomeVerse[] = [
  {
    id: "BG_2.47",
    ref: "2.47",
    sa: ["कर्मण्येवाधिकारस्ते मा फलेषु कदाचन ।", "मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ॥"],
    iast: ["karmaṇyevādhikāraste mā phaleṣu kadācana |", "mā karmaphalaheturbhūrmā te saṅgo’stvakarmaṇi ||"],
    en: "You have the right to work alone, but not to the fruits of it. Do not be driven by the results of your work, nor have attachment to inaction.",
    theme: "Work, not its fruits",
    gloss: "Give the work everything. Let go of what it earns you.",
  },
  {
    id: "BG_2.14",
    ref: "2.14",
    sa: ["मात्रास्पर्शास्तु कौन्तेय शीतोष्णसुखदुःखदाः ।", "आगमापायिनोऽनित्यास्तांस्तितिक्षस्व भारत ॥"],
    iast: ["mātrāsparśāstu kaunteya śītoṣṇasukhaduḥkhadāḥ |", "āgamāpāyino’nityāstāṃstitikṣasva bhārata ||"],
    en: "The contact of the senses with their objects, O Arjuna, gives rise to feelings of cold and heat, pleasure and pain. They come and go, never lasting long. Endure them, O Arjuna.",
    theme: "This too will pass",
    gloss: "Pleasure and pain arrive and leave. You can learn to bear both.",
  },
  {
    id: "BG_2.20",
    ref: "2.20",
    // The source splits this triṣṭubh into four quarter-lines mid-word; shown as two half-verses.
    sa: ["न जायते म्रियते वा कदाचिन्नायं भूत्वा भविता वा न भूयः ।", "अजो नित्यः शाश्वतोऽयं पुराणो न हन्यते हन्यमाने शरीरे ॥"],
    iast: ["na jāyate mriyate vā kadācinnāyaṃ bhūtvā bhavitā vā na bhūyaḥ |", "ajo nityaḥ śāśvato’yaṃ purāṇo na hanyate hanyamāne śarīre ||"],
    en: "It is never born; it never dies; having come into existence once, it never ceases to exist. Unborn, eternal, perpetual, and primordial, it is not destroyed when the body is destroyed.",
    theme: "What never dies",
    gloss: "What you most deeply are was never born, and cannot be killed.",
  },
  {
    id: "BG_3.35",
    ref: "3.35",
    sa: ["श्रेयान्स्वधर्मो विगुणः परधर्मात्स्वनुष्ठितात् ।", "स्वधर्मे निधनं श्रेयः परधर्मो भयावहः ॥"],
    iast: ["śreyānsvadharmo viguṇaḥ paradharmātsvanuṣṭhitāt |", "svadharme nidhanaṃ śreyaḥ paradharmo bhayāvahaḥ ||"],
    en: "Better is one's own duty, even if done poorly, than the duty of another done well. It is better to die while performing one's own duty; the duty of another is full of fear.",
    theme: "Your own path",
    gloss: "Your own path walked imperfectly beats someone else's walked well.",
  },
  {
    id: "BG_4.7",
    ref: "4.7",
    sa: ["यदा यदा हि धर्मस्य ग्लानिर्भवति भारत ।", "अभ्युत्थानमधर्मस्य तदाऽऽत्मानं सृजाम्यहम् ॥"],
    iast: ["yadā yadā hi dharmasya glānirbhavati bhārata |", "abhyutthānamadharmasya tadā’’tmānaṃ sṛjāmyaham ||"],
    en: "Whenever there is a decline of Dharma, O Arjuna, and an uprising of Adharma, then I incarnate myself.",
    theme: "Whenever dharma declines",
    gloss: "When right order breaks down, Krishna says, he comes back.",
  },
  {
    id: "BG_6.5",
    ref: "6.5",
    sa: ["उद्धरेदात्मनाऽऽत्मानं नात्मानमवसादयेत् ।", "आत्मैव ह्यात्मनो बन्धुरात्मैव रिपुरात्मनः ॥"],
    iast: ["uddharedātmanā’’tmānaṃ nātmānamavasādayet |", "ātmaiva hyātmano bandhurātmaiva ripurātmanaḥ ||"],
    en: "One should raise oneself by one's own mind and not allow oneself to sink; for the mind alone is the friend of the self, and the mind alone is the foe of the self.",
    theme: "Lift yourself",
    gloss: "You can be your own best friend, or your own worst enemy.",
  },
  {
    id: "BG_6.35",
    ref: "6.35",
    sa: ["असंशयं महाबाहो मनो दुर्निग्रहं चलं ।", "अभ्यासेन तु कौन्तेय वैराग्येण च गृह्यते ॥"],
    iast: ["asaṃśayaṃ mahābāho mano durnigrahaṃ calaṃ |", "abhyāsena tu kaunteya vairāgyeṇa ca gṛhyate ||"],
    en: "The mind is indeed hard to subdue and fickle, O mighty-armed one, but, O son of Kunti, it can be brought under control through practice and the exercise of dispassion.",
    theme: "The restless mind",
    gloss: "A restless mind can be trained, through practice and letting go.",
  },
  {
    id: "BG_18.66",
    ref: "18.66",
    sa: ["सर्वधर्मान्परित्यज्य मामेकं शरणं व्रज ।", "अहं त्वा सर्वपापेभ्यो मोक्षयिष्यामि मा शुचः ॥"],
    iast: ["sarvadharmānparityajya māmekaṃ śaraṇaṃ vraja |", "ahaṃ tvā sarvapāpebhyo mokṣayiṣyāmi mā śucaḥ ||"],
    en: "Relinquishing all Dharmas completely, seek Me alone for refuge. I will release you from all sins; grieve not.",
    theme: "Surrender",
    gloss: "The last word of the teaching: let go, take refuge, do not grieve.",
  },
];

/** Krishna's first reply to Arjuna's collapse (BG 2.3), quoted in the "Fight or flight" section. */
export const ARISE = {
  id: "BG_2.3",
  ref: "2.3",
  sa: "क्षुद्रं हृदयदौर्बल्यं त्यक्त्वोत्तिष्ठ परन्तप ॥",
  en: "Shake off this base faint-heartedness and arise, O conqueror of foes!",
};

/** Life situations from the graph (LifeDilemma nodes), the most common ways people arrive. */
export const SITUATIONS: { id: string; label: string }[] = [
  { id: "dilemma:decision-paralysis", label: "I can't decide" },
  { id: "dilemma:outcome-anxiety", label: "I'm afraid of failing" },
  { id: "dilemma:burnout", label: "I'm burnt out" },
  { id: "dilemma:self-doubt", label: "I doubt myself" },
  { id: "dilemma:anger", label: "I get angry too fast" },
  { id: "dilemma:bereavement", label: "I lost someone" },
  { id: "dilemma:restless-mind", label: "My mind won't settle" },
  { id: "dilemma:life-purpose", label: "I don't know my purpose" },
];

export interface Scene {
  /** True when the quote is one sentence of a longer translation. */
  excerpt?: boolean;
  chapter: number;
  /** Sanskrit chapter title (IAST). */
  name: string;
  title: string;
  verseId: string;
  ref: string;
  quote: string;
  image: "ch01" | "ch02" | "ch18";
  alt: string;
}

/** The arc of the conversation in three paintings (chapter 11 has its own section with the graph). */
export const SCENES: Scene[] = [
  {
    chapter: 1,
    name: "Arjuna Viṣāda Yoga",
    title: "The bow falls",
    verseId: "BG_1.47",
    ref: "1.47",
    quote: "Having spoken thus on the battlefield, Arjuna threw aside his bow and arrows and sat down on the chariot seat, his heart overwhelmed with grief.",
    image: "ch01",
    alt: "Warriors on both sides blow conch shells as Krishna and Arjuna's chariot stands alone between the two armies at dusk.",
  },
  {
    chapter: 2,
    name: "Sāṅkhya Yoga",
    title: "The teaching begins",
    verseId: "BG_2.11",
    excerpt: true,
    ref: "2.11",
    quote: "The wise grieve neither for the dead nor for the living.",
    image: "ch02",
    alt: "Krishna and Arjuna sit facing each other under the chariot's golden canopy, Krishna speaking with an open hand.",
  },
  {
    chapter: 18,
    name: "Mokṣa Saṃnyāsa Yoga",
    title: "The doubt is gone",
    verseId: "BG_18.73",
    excerpt: true,
    ref: "18.73",
    quote: "Freed from doubts, I stand steadfast, and I will fulfill Your will.",
    image: "ch18",
    alt: "Arjuna stands upright in the chariot holding his bow, Krishna beside him, the four white horses ready at sunset.",
  },
];

/** The Ladder of Fall (BG 2.62 to 2.63), a causal chain in the graph. Labels are plain-English glosses. */
export const LADDER = {
  id: "ladder-of-fall",
  steps: [
    { id: "emotion:vishaya-dhyana", label: "Dwelling on things" },
    { id: "emotion:sanga", label: "Attachment" },
    { id: "emotion:kama", label: "Desire" },
    { id: "emotion:krodha", label: "Anger" },
    { id: "emotion:sammoha", label: "Delusion" },
    { id: "emotion:smriti-vibhrama", label: "Lost memory" },
    { id: "emotion:buddhi-nasha", label: "Lost judgement" },
    { id: "emotion:pranasha", label: "Ruin" },
  ],
};

export const SAMPLE_QUESTIONS = ["How do I stop worrying about results?", "What does the Gita say about anger?", "Is it ever right to walk away?"];

/** Shown while the graph data loads; matches public/data/gita-graph.json (stats). */
export const GRAPH_COUNTS_FALLBACK = { Chapter: 18, Verse: 701, SanskritConcept: 67, Emotion: 33, LifeDilemma: 22, Character: 16, edges: 5350 };
