// Graph integrity checks. The build refuses to write output if any error is found.

export const NODE_LABELS = ["Chapter", "Verse", "Character", "SanskritConcept", "Emotion", "LifeDilemma"];

export function verifyGraph(graph, versesDoc) {
  const errors = [];
  const warnings = [];
  const ids = new Map();
  for (const n of graph.nodes) {
    if (ids.has(n.id)) errors.push(`duplicate node id ${n.id}`);
    ids.set(n.id, n);
    if (!NODE_LABELS.includes(n.type)) errors.push(`node ${n.id} has unknown label ${n.type}`);
  }
  const edgeKeys = new Set();
  const degree = new Map();
  for (const e of graph.edges) {
    if (!ids.has(e.source)) errors.push(`edge ${e.type} has missing source ${e.source}`);
    if (!ids.has(e.target)) errors.push(`edge ${e.type} has missing target ${e.target}`);
    if (e.source === e.target) errors.push(`self-loop ${e.type} on ${e.source}`);
    const key = `${e.type}|${e.source}|${e.target}`;
    if (edgeKeys.has(key)) errors.push(`duplicate edge ${key}`);
    edgeKeys.add(key);
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }

  const byType = (t) => graph.nodes.filter((n) => n.type === t);
  const chapters = byType("Chapter");
  const verses = byType("Verse");
  if (chapters.length !== 18) errors.push(`expected 18 chapters, found ${chapters.length}`);
  const canonical = verses.filter((v) => v.canonical);
  if (verses.length !== 701) errors.push(`expected 701 verse nodes (700 canonical + 13.1), found ${verses.length}`);
  if (canonical.length !== 700) errors.push(`expected 700 canonical verses, found ${canonical.length}`);

  for (const c of chapters) {
    const n = verses.filter((v) => v.chapter === c.number).length;
    if (n !== c.verseCount) errors.push(`chapter ${c.number}: ${n} verse nodes vs verseCount ${c.verseCount}`);
  }

  const edgesOf = (type) => graph.edges.filter((e) => e.type === type);
  const belongs = new Set(edgesOf("BELONGS_TO").map((e) => e.source));
  const spoke = new Map();
  for (const e of edgesOf("SPOKE")) spoke.set(e.target, (spoke.get(e.target) || 0) + 1);
  for (const v of verses) {
    if (!belongs.has(v.id)) errors.push(`${v.id} has no BELONGS_TO`);
    if (spoke.get(v.id) !== 1) errors.push(`${v.id} has ${spoke.get(v.id) || 0} SPOKE edges (expected exactly 1)`);
  }
  if (edgesOf("NEXT_VERSE").length !== verses.length - 1) errors.push(`NEXT_VERSE chain broken`);

  for (const t of ["SanskritConcept", "Emotion", "LifeDilemma", "Character"]) {
    for (const n of byType(t)) if (!degree.get(n.id)) errors.push(`${t} ${n.id} is isolated`);
  }
  for (const d of byType("LifeDilemma")) {
    const k = graph.edges.filter((e) => e.type === "ADDRESSES_DILEMMA" && e.target === d.id).length;
    if (k < 4) errors.push(`dilemma ${d.id} has only ${k} verses`);
  }
  for (const c of byType("SanskritConcept")) {
    const k = graph.edges.filter((e) => (e.type === "MENTIONS_CONCEPT" || e.type === "DEFINES_CONCEPT") && e.target === c.id).length;
    if (k === 0) errors.push(`concept ${c.id} has no grounding verse`);
  }

  if (versesDoc) {
    if (versesDoc.verses.length !== verses.length) errors.push(`gita-verses.json has ${versesDoc.verses.length} verses vs graph ${verses.length}`);
    for (const v of versesDoc.verses) {
      if (!v.sanskrit?.length) errors.push(`${v.id} has no Sanskrit`);
      if (!v.translations?.en || !Object.keys(v.translations.en).length) errors.push(`${v.id} has no English translation`);
      if (!v.padaccheda?.length) warnings.push(`${v.id} has no padaccheda`);
    }
  }

  const stats = {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    byLabel: Object.fromEntries(NODE_LABELS.map((l) => [l, byType(l).length])),
    byRelation: graph.edges.reduce((acc, e) => ((acc[e.type] = (acc[e.type] || 0) + 1), acc), {}),
  };
  return { errors, warnings, stats };
}
