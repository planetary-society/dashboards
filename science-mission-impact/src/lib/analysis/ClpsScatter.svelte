<script>
	// Papers per $1B at the CLPS landers' age against life-cycle cost (clpsScatterLayout): the surface
	// missions as dots in their selection's tone (RateBoxes' directed and competed), failures as X's
	// at zero, each lander an open diamond (its papers to date over its own cost) and the landers
	// pooled one large diamond. Every mark is named. The page supplies the title and caption.
	import { money, moneyTick } from '$lib/format.js';
	import { CLPS_SCATTER_HEIGHT, clpsScatterLayout, perBillion } from './charts-c.js';

	/** clps: Site.clps; reads `surface` and the landers in `missions`. */
	let { clps } = $props();
	let width = $state(0);
	const L = $derived(width > 0 ? clpsScatterLayout(clps, width) : null);
	const s = $derived(clps.surface);
	const pooledRate = $derived(perBillion(s.clps.papers, s.clps.cost));
	const rate = (v) => (v == null ? '—' : String(Math.round(v)));
	const SELECTION = { competed: 'Competed', directed: 'Directed' };
	// the key lists a selection only when a plotted mission has it
	const shown = $derived(new Set(s.missions.filter((m) => m.cost > 0).map((m) => (m.failed ? 'failed' : (m.selection ?? 'unknown')))));
	const aria = $derived(
		`Papers per $1B in the first ${s.month} months against life-cycle cost (log scale) for ${s.missions.length} surface missions, ` +
			`and each CLPS lander's papers to date per $1B of its own cost. The ${clps.missions.length} CLPS landers together: ` +
			`${s.clps.papers} papers for ${money(s.clps.cost)}, ${rate(pooledRate)} per $1B.`
	);
	const diamond = (d) => `M${d.x},${d.y - d.r}L${d.x + d.r},${d.y}L${d.x},${d.y + d.r}L${d.x - d.r},${d.y}Z`;
	const cross = (p, k = 4) => `M${p.x - k},${p.y - k}L${p.x + k},${p.y + k}M${p.x + k},${p.y - k}L${p.x - k},${p.y + k}`;
</script>

<div class="clps-scatter">
	<p class="key" aria-hidden="true">
		{#if shown.has('directed')}<span><svg width="10" height="10"><circle class="directed" cx="5" cy="5" r="4" /></svg>Directed</span>{/if}
		{#if shown.has('competed')}<span><svg width="10" height="10"><circle class="competed" cx="5" cy="5" r="4" /></svg>Competed</span>{/if}
		{#if shown.has('unknown')}<span><svg width="10" height="10"><circle class="unknown" cx="5" cy="5" r="3.5" /></svg>Selection unknown</span>{/if}
		{#if shown.has('failed')}<span><svg width="10" height="10"><path class="failed" d="M1.5,1.5L8.5,8.5M8.5,1.5L1.5,8.5" /></svg>Failed</span>{/if}
		<span><svg width="12" height="12"><path class="lander" d="M6,1L11,6L6,11L1,6Z" /></svg>CLPS lander</span>
		<span><svg width="14" height="14"><path class="pooled" d="M7,0L14,7L7,14L0,7Z" /></svg>CLPS combined</span>
	</p>
	<p class="axis-title">Papers per $1B, first {s.month} months</p>
	<div class="stage" bind:clientWidth={width} style:height="{CLPS_SCATTER_HEIGHT}px">
		{#if L}
			<svg width={L.W} height={L.H} role="img" aria-label={aria}>
				{#each L.yTicks as t (t)}
					<line class="grid" x1={L.left} x2={L.right} y1={L.y(t)} y2={L.y(t)} />
					<text class="tick" x={L.left - 6} y={L.y(t)} dy="0.32em" text-anchor="end">{t}</text>
				{/each}
				{#each L.xTicks as t (t.value)}
					{#if t.grid}<line class="grid" x1={L.x(t.value)} x2={L.x(t.value)} y1={L.top} y2={L.bottom} />{/if}
					<line class="axis" x1={L.x(t.value)} x2={L.x(t.value)} y1={L.bottom} y2={L.bottom + 4} />
					{#if t.label}<text class="tick" x={L.x(t.value)} y={L.H - 4} text-anchor="middle">{moneyTick(t.value)}</text>{/if}
				{/each}
				<line class="axis" x1={L.left} x2={L.right} y1={L.bottom} y2={L.bottom} />
				{#each L.labels as l (l.id)}
					{#if l.leader}<line class="leader" x1={l.leader.x1} y1={l.leader.y1} x2={l.leader.x2} y2={l.leader.y2} />{/if}
				{/each}
				{#each L.points as p (p.id)}
					{#if p.kind === 'failed'}
						<path class="failed" d={cross(p)} />
					{:else}
						<circle class={p.kind} cx={p.x} cy={p.y} r={p.r} />
					{/if}
				{/each}
				{#each L.landers as d (d.id)}<path class="lander" d={diamond(d)} />{/each}
				{#if L.pooled}<path class="pooled" d={diamond(L.pooled)} />{/if}
				{#each L.labels as l (l.id)}
					<text class="name" class:big={l.id === 'clps'} text-anchor={l.anchor}>
						{#each l.lines as line, i (i)}<tspan x={l.tx} y={line.y} dy="0.32em">{line.text}</tspan>{/each}
					</text>
				{/each}
			</svg>
		{/if}
	</div>
	<p class="axis-title x">Life-cycle cost (log scale)</p>
	<!-- the clip goes on a wrapper: a table grows to its content whatever width .sr-only gives it, and widened the page -->
	<div class="sr-only"><table>
		<caption>Papers per $1B: surface missions in their first {s.month} months, CLPS landers to date</caption>
		<thead><tr><th scope="col">Mission</th><th scope="col">Selection</th><th scope="col">Life-cycle cost</th><th scope="col">Papers</th><th scope="col">Papers per $1B</th></tr></thead>
		<tbody>
			{#each s.missions as m (m.id)}
				<tr>
					<th scope="row">{m.name}{m.failed ? ' (failed)' : ''}</th>
					<td>{SELECTION[m.selection] ?? '—'}</td>
					<td>{m.cost > 0 ? money(m.cost) : 'no cost, not plotted'}</td>
					<td>{m.papers}</td>
					<td>{rate(perBillion(m.papers, m.cost))}</td>
				</tr>
			{/each}
			{#each clps.missions as m (m.id)}
				<tr><th scope="row">{m.name} (CLPS lander, to date)</th><td>—</td><td>{m.cost > 0 ? money(m.cost) : 'no cost, not plotted'}</td><td>{m.papers ?? '—'}</td><td>{rate(m.papers == null ? null : perBillion(m.papers, m.cost))}</td></tr>
			{/each}
			<tr><th scope="row">CLPS, {clps.missions.length} landers combined</th><td>—</td><td>{money(s.clps.cost)}</td><td>{s.clps.papers}</td><td>{rate(pooledRate)}</td></tr>
		</tbody>
	</table></div>
</div>

<style>
	.clps-scatter {
		/* selection's two tones, as RateBoxes draws them */
		--tone-competed: var(--neptune);
		--tone-directed: #8c8c8c;
		min-width: 0;
	}

	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin-bottom: 10px;
		font-size: 13px;
		color: var(--dust);
	}

	.key span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}

	.key svg {
		overflow: visible;
	}

	.axis-title {
		font-size: 12px;
		color: var(--dust);
	}

	.axis-title.x {
		margin-top: 4px;
		text-align: center;
	}

	.stage {
		position: relative;
		margin-top: 4px;
	}

	svg {
		display: block;
		overflow: visible;
	}

	text {
		font-family: var(--sans);
	}

	.tick {
		font-size: 11px;
		fill: var(--soil);
	}

	.grid {
		stroke: var(--shadow);
		opacity: 0.6;
	}

	.axis {
		stroke: var(--soil);
	}

	.leader {
		stroke: var(--soil);
		stroke-width: 1;
	}

	.directed,
	.competed {
		stroke: var(--black);
		stroke-width: 1;
	}

	.directed {
		fill: var(--tone-directed);
	}

	.competed {
		fill: var(--tone-competed);
	}

	.unknown {
		fill: var(--black);
		stroke: var(--dust);
		stroke-width: 1.25;
	}

	.failed {
		fill: none;
		stroke: var(--flame);
		stroke-width: 1.5;
	}

	.lander {
		fill: var(--black);
		stroke: var(--white);
		stroke-width: 1.5;
	}

	.pooled {
		fill: var(--white);
	}

	.name {
		font-size: 11px;
		font-weight: 500;
		fill: var(--dust);
		paint-order: stroke;
		stroke: var(--black);
		stroke-width: 3px;
		stroke-linejoin: round;
	}

	.name.big {
		font-size: 12px;
		font-weight: 600;
		fill: var(--white);
	}
</style>
