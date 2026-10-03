# Paper kinds: how `paper-kinds.json` is made

`paper-kinds.json` sorts every refereed paper attributed to a mission at or under the cost
threshold (`smi.config.json` `thresholdCost`) into one of six kinds, by what role the mission's
own flight data play in it. The packager (`scripts/lib/kinds.mjs`) reads it into `site.kinds`;
an in-window paper without an entry fails packaging, an entry that matches no paper fails too.

Entries: `{ mission, bibcode, kind, confidence, note }`. `mission` is the dashboard mission id,
`confidence` is `high` or `low`, `note` is a one-line reason written for an outside reader
(empty for `results`).

First made on 2026-10-03 from titles, abstracts, journals and keywords fetched from ADS, by an
AI language model (Claude Opus) working through the rubric below in ten chunks, then
spot-checked by hand (the small missions in full, the large ones by sample). The 43 papers the
upstream curation files mark as mission or instrument overviews were given to the model as
hints. 268 of 2,054 calls are marked `low`.

To update after the corpus changes: run `npm run data`; it names every unclassified in-window
paper. Classify those with the rubric below (title, abstract, venue), add them, and re-run.

---

# Paper classification rubric

The rubric classifies refereed journal articles that a bibliometric search attributed to a NASA science mission. The search matched the mission's name in each paper's abstract, so the corpus contains everything from genuine science results to papers that merely mention the mission. For each paper, decide what role the MISSION'S OWN FLIGHT DATA play in it.

The reader has the mission's context (name, full name, objective, instruments, launch and end dates) and, for each paper, its title, venue, year, citations, keywords and abstract. Where the upstream curation marks a paper as a mission or instrument overview, that is strong evidence for `mission` unless the abstract clearly reports scientific findings from flight data as a principal contribution. A paper shared by two missions is classified once for each.

## Kinds (exactly one per paper)

- `results` — reports scientific findings derived from this mission's own flight observations or measurements. Includes multi-mission or multi-instrument studies in which this mission's data are among the inputs; models fitted to, constrained by, or validated against its data; statistical or event studies of its data; re-analyses of its archive years later; laboratory or theoretical work whose purpose is to interpret a specific measurement this mission made (e.g. modelling an observed plume with the mission's observations as constraints).
- `data` — makes this mission's science data usable, without reporting a new finding: calibration or validation of the science data product, retrieval or inversion algorithms, data releases and data-set descriptions, cross-calibration against other instruments, reprocessing, uncertainty analyses, software for processing the science data.
- `mission` — about the mission or instrument itself: mission overview and science objectives, spacecraft or instrument design, build, pre-launch tests, technology demonstration, in-flight engineering performance (pointing, attitude, thermal, power, radio, flight software, ground systems), operations, anomalies, lessons learned. A first-light or demonstration paper that reports observations of the mission's science target (the first radar observations of rain, a transit) is `results`; one that only characterises the instrument stays `mission` (editorial call by The Planetary Society, 2026-10-03).
- `review` — a review, survey, roadmap, history, programmatic or policy paper in which this mission is one of several things discussed; also editorials, commentaries, comments on a paper and replies to comments.
- `future` — anticipates or plans for results not yet obtained: pre-flight predictions, planned science, simulated expected performance, concept studies for this mission or a follow-on; the mission's flight data play no part.
- `other` — this mission's flight data play no part and the paper is not a review of the field: it is about another mission, instrument, model, laboratory experiment or theory and mentions this mission only for context, comparison, heritage or motivation; or it is a wrong-mission match (the name means something else).

## Tie-breaks

1. If the paper both describes the mission and reports new scientific findings from its flight data as a principal contribution (not just a demonstration), use `results`.
2. A paper that uses the mission's data to validate ANOTHER instrument or model is `results` only if it also draws a conclusion about nature; if it only characterises the other instrument, it is `other`.
3. Calibration of the science data product = `data`; characterisation of the hardware = `mission`. If an abstract does both, follow the paper's stated purpose.
4. A theoretical or model paper that never uses the mission's measurements, and cites the mission only as motivation or as a future test, is `other` (or `future` if it predicts what the mission will see).
5. Missing abstract: decide from title, venue and keywords, and set `confidence` to `low`.

## Entry shape

One object per paper:

```json
{
  "bibcode": "...",
  "mission": "...",
  "kind": "results|data|mission|review|future|other",
  "confidence": "high|low",
  "note": "..."
}
```

`note`: for every kind other than `results`, one short clause (≤ 14 words) stating the evidence, written for an outside reader (no rule numbers, no "per rubric"). For `results`, an empty string. Use plain ASCII quotes inside notes.
