"use client";
import { useGita, type ColorBy } from "@/lib/store/useGitaStore";
import { RELATION_GROUPS, type RelationGroup } from "@/lib/graph/relations";

const COLOR_HELP: Record<ColorBy, string> = {
  label: "Each kind of node has its own colour and shape, as in the legend.",
  chapter: "Verses shade from light (chapter 1) to deep (chapter 18), so you can see where in the text an idea is concentrated.",
  community: "Louvain community detection groups nodes that link to each other more than to the rest. The eight largest groups get a colour.",
};

/** Display options for the cosmos: colour encoding and which families of relationships are drawn. */
export function DisplayPanel() {
  const edgeGroups = useGita((s) => s.edgeGroups);
  const toggleEdgeGroup = useGita((s) => s.toggleEdgeGroup);
  const colorBy = useGita((s) => s.colorBy);
  const setColorBy = useGita((s) => s.setColorBy);
  const communities = useGita((s) => s.communities);

  return (
    <div className="space-y-5">
      <section>
        <div className="label mb-2">Colour nodes by</div>
        <div className="seg w-full" role="radiogroup" aria-label="Colour nodes by">
          {(
            [
              ["label", "Type"],
              ["chapter", "Chapter"],
              ["community", "Community"],
            ] as const
          ).map(([id, name]) => (
            <button key={id} role="radio" aria-checked={colorBy === id} className="flex-1" onClick={() => setColorBy(id)}>
              {name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] leading-[1.45] text-text-3">{COLOR_HELP[colorBy]}</p>
        {colorBy === "community" && communities && (
          <p className="num mt-1 text-[12px] text-text-3">
            {communities.count} communities found, modularity {communities.modularity.toFixed(2)}
          </p>
        )}
      </section>
      <section>
        <div className="label mb-1">Relationships shown</div>
        <ul>
          {(Object.keys(RELATION_GROUPS) as RelationGroup[]).map((g) => (
            <li key={g}>
              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-2)] px-1 py-2 hover:bg-surface-3">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={edgeGroups[g]} onChange={() => toggleEdgeGroup(g)} />
                <span className="min-w-0">
                  <span className="block text-[13px] text-text">{RELATION_GROUPS[g].label}</span>
                  <span className="block text-[12px] leading-4 text-text-3">{RELATION_GROUPS[g].hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
