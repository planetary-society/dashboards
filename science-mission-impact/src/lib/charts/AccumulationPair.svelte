<script>
	// Two views of the same accumulation. Lifetime: cumulative publications and citations by
	// calendar year, each against its own axis, both topping out at that series' final total, so
	// the lines meet at the final observed year and the gap between them is the lag.
	// Early window: one horizontal bar per year since the start of science. Papers only count for
	// the first few years, their citations keep arriving for several more, and two lines on one
	// plot made that look like a mismatch. Here the publications are a column of figures that
	// simply ends, and the citations are a bar that keeps growing.
	import { scaleLinear } from 'd3-scale';
	import { line } from 'd3-shape';
	import { int, compact, plural, longDate } from '$lib/format.js';
	import { windowLabel } from '$lib/copy/window.js';
	import { lifetimeModel, windowModel, axes, lifetimeDomain, missionMilestones, layoutMilestones, stackLabels, box } from './accumulation.js';

	/** Missions pass lifecycle dates; divisions replace the window panel with a companion chart. */
	let { lifetime, window: windowSeries, policy, windowNote, companion, dates = {} } = $props();

	const HEIGHT = 300;

	const life = $derived(lifetimeModel(lifetime));
	const milestones = $derived(missionMilestones(dates));
	const incomplete = $derived(life?.citationCoverage.status === 'incomplete');
	const coverageNote = $derived(incomplete ? `Citation timeline incomplete: ${int(life.citationCoverage.observed)} of ${int(life.citationCoverage.expected)} reported citations have dated records; ${int(life.citationCoverage.missing)} missing. Headline totals include all reported citations.` : '');
	const win = $derived(windowModel(windowSeries, policy));
	const windowState = $derived(windowSeries?.outputBasis && windowSeries.outputBasis !== 'measured' ? 'unavailable' : windowSeries ? windowSeries.status || 'available' : 'missing');
	const windowTitle = $derived(windowLabel(policy));

	/** Totals read as figures, not axis ticks, until they get long enough to need folding. */
	const total = (n) => (n >= 1e6 ? compact(n) : int(n));

	let lifeWidth = $state(0);
	let hover = $state(null);

	const L = $derived(life && lifeWidth > 0 ? lifeChart(lifeWidth) : null);

	function lifeChart(width) {
		const b = box(width, HEIGHT);
		const x = scaleLinear().domain(lifetimeDomain(life.years, milestones)).range([b.left, b.right]);
		const { markers, height } = layoutMilestones(milestones, x, b);
		const [pubLabelY, citeLabelY] = stackLabels(b.top, 2);
		b.top += height;
		const { yPub, yCite, pubTicks, citeTicks } = axes({ pubTotal: life.pubTotal, citeTotal: life.citeTotal, top: b.top, bottom: b.bottom });
		const pubLine = line()
			.x((p) => x(p.year))
			.y((p) => yPub(p.pub));
		const citeLine = line()
			.x((p) => x(p.year))
			.y((p) => yCite(p.cite));
		const cut = life.partialIndex > 0 ? life.partialIndex : life.points.length;
		const solid = life.points.slice(0, cut);
		const dashed = life.partialIndex > 0 ? life.points.slice(life.partialIndex - 1) : null;
		return {
			b,
			x,
			markers,
			yPub,
			yCite,
			pubTicks,
			citeTicks,
			pubPath: pubLine(solid),
			citePath: citeLine(solid),
			pubDash: dashed && pubLine(dashed),
			citeDash: dashed && citeLine(dashed),
			pubLabelY,
			citeLabelY,
			ticks: x.ticks(width < 520 ? 4 : 6).filter(Number.isInteger)
		};
	}

	const point = $derived(hover != null && life ? life.points[Math.min(hover, life.points.length - 1)] : null);
	const readout = $derived(point ? `${point.year} · ${int(point.pub)} tracked publications · ${int(point.cite)} citations` : '');

	const lifeLabel = $derived(
		life
			? `Cumulative tracked publications and citations, ${life.years[0]} to ${life.years[life.years.length - 1]}: ${int(life.pubTotal)} tracked ${plural(life.pubTotal, 'publication')} and ${int(life.citeTotal)} ${plural(life.citeTotal, 'citation')} in total.${
					milestones.map((m) => ` ${m.label}: ${longDate(m.date)}.`).join('')
				} ${coverageNote}`
			: 'No lifetime series.'
	);
	const winLabel = $derived(
		win
			? `Cumulative tracked publications and citations within the ${windowTitle}, with ${policy.citationYears} subsequent citation years per paper: ${int(win.pubTotal)} tracked ${plural(win.pubTotal, 'publication')} and ${int(win.citeTotal)} ${plural(win.citeTotal, 'citation')} in total.`
			: 'No window series.'
	);

	function scrub(event) {
		if (!life || !L) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const t = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
		const year = L.x.invert(L.b.left + t * (L.b.right - L.b.left));
		hover = life.points.reduce((best, p, i) => Math.abs(p.year - year) < Math.abs(life.points[best].year - year) ? i : best, 0);
	}
</script>

<section class="pair">
	<figure class="panel">
		<h2 class="chart-title">Lifetime</h2>
		{#if incomplete}<p class="meta note">{coverageNote}</p>{/if}
		<p class="readout meta" aria-hidden="true">{readout}</p>
		<div class="plot">
			<!-- the SVG's height is reserved before hydration measures the width, so nothing below jumps -->
			<div class="canvas" role="img" aria-label={lifeLabel} bind:clientWidth={lifeWidth} style:min-height={life ? `${HEIGHT}px` : null}>
				{#if L}
					<svg width={lifeWidth} height={HEIGHT} viewBox="0 0 {lifeWidth} {HEIGHT}" aria-hidden="true">
						<line class="rule" x1={L.b.left} x2={L.b.right} y1={L.b.bottom} y2={L.b.bottom} />
						<!-- gridlines follow the publications axis; with two large totals the citation ticks share its rows -->
						{#each L.pubTicks as t (t.v)}
							{#if t.v > 0}<line class="rule" x1={L.b.left} x2={L.b.right} y1={t.y} y2={t.y} />{/if}
							<text class="tick pub" x={L.b.left - 8} y={t.y} dy="0.32em" text-anchor="end">{compact(t.v)}</text>
						{/each}
						{#each L.citeTicks as t (t.v)}
							<text class="tick cite" x={L.b.right + 8} y={t.y} dy="0.32em">{compact(t.v)}</text>
						{/each}

						{#each L.markers as marker (marker.key)}
							<line class="milestone" x1={marker.x} x2={marker.x} y1={marker.labelY + 4} y2={L.b.bottom} />
							<text class="milestone-label" x={marker.labelX} y={marker.labelY}>{marker.label}</text>
						{/each}

						{#if L.pubDash}
							<path class="line pub dash" d={L.pubDash} />
							<path class="line cite dash" d={L.citeDash} />
						{/if}
						<path class="line cite" class:dash={incomplete} d={L.citePath} />
						<path class="line pub" d={L.pubPath} />

						<text class="end pub" x={L.b.right} y={L.pubLabelY} text-anchor="end">{total(life.pubTotal)} tracked {plural(life.pubTotal, 'publication')}</text>
						<text class="end cite" x={L.b.right} y={L.citeLabelY} text-anchor="end">{total(life.citeTotal)} {plural(life.citeTotal, 'citation')}</text>

						{#if point}
							<line class="cursor" x1={L.x(point.year)} x2={L.x(point.year)} y1={L.b.top} y2={L.b.bottom} />
							<circle class="dot cite" cx={L.x(point.year)} cy={L.yCite(point.cite)} r="3" />
							<circle class="dot pub" cx={L.x(point.year)} cy={L.yPub(point.pub)} r="3" />
						{/if}

						{#each L.ticks as t (t)}
							<text class="tick" x={L.x(t)} y={HEIGHT - 10} text-anchor="middle">{t}</text>
						{/each}
					</svg>
				{/if}
			</div>
			{#if L && life}
				<input
					class="scrub"
					type="range"
					min="0"
					max={life.points.length - 1}
					step="1"
					value={hover ?? life.points.length - 1}
					aria-label="Year"
					aria-valuetext={point ? `${point.year}: ${int(point.pub)} tracked publications, ${int(point.cite)} citations` : undefined}
					style:left="{L.b.left}px"
					style:top="{L.b.top}px"
					style:width="{Math.max(0, L.b.right - L.b.left)}px"
					style:height="{Math.max(0, L.b.bottom - L.b.top)}px"
					oninput={(e) => (hover = Number(e.currentTarget.value))}
					onpointermove={scrub}
					onpointerleave={() => (hover = null)}
					onfocus={() => (hover ??= life.points.length - 1)}
					onblur={() => (hover = null)}
				/>
			{/if}
		</div>
		{#if !life}
			<p class="meta note">Not available for this mission.</p>
		{/if}
	</figure>

	{#if companion}
		<div class="panel">{@render companion()}</div>
	{:else}
	<figure class="panel">
		<h2 class="chart-title">{windowTitle}</h2>
		{#if windowSeries?.start && windowSeries?.end}
			<p class="meta note">Tracked publications from {longDate(windowSeries.start)} to {longDate(windowSeries.end)}{#if windowSeries.matureDate}; citations counted through {longDate(windowSeries.matureDate)}{/if}.</p>
		{/if}
		{#if windowState === 'available' && win}
			<p class="readout meta">Running totals aligned to each publication window’s opening month. Citation rows use calendar-year offsets from its opening year.</p>
			{#if windowSeries.missionsByYear}<p class="meta note">Windows have different durations. Coverage beside each row counts measured mission windows that reach any part of that publication year; closed windows add no later papers.</p>{/if}
			<p class="sr-only">{winLabel}</p>
			<ol class="years">
				<li class="head meta" aria-hidden="true">
					<span></span>
					<span class="pubs">Papers</span>
					<span class="cites">Citations to those papers</span>
				</li>
				{#each win.rows as row (row.year)}
					<li class:first-closed={row.year === win.pubYears + 1}>
						<span class="year">Year {row.year}{#if row.missions != null}{' '}<span class="coverage">{int(row.missions)} {plural(row.missions, 'mission')}</span>{/if}</span>
						<span class="pubs">
							{#if row.papers != null}{int(row.papers)}<span class="sr-only">{' '}tracked {plural(row.papers, 'publication')}</span>{:else if row.year === win.pubYears + 1}<span class="meta">window closed</span>{/if}
						</span>
						<span class="track">
							<span class="bar" style:width="calc((100% - var(--val)) * {row.to})">
								<span class="was" style:flex-grow={row.from}></span>
								<span class="new" style:flex-grow={row.to - row.from}></span>
							</span>
							<span class="val">{total(row.cite)}<span class="sr-only">{' '}{plural(row.cite, 'citation')}</span></span>
						</span>
					</li>
				{/each}
			</ol>
			{#if windowNote}
				<p class="meta note">{@render windowNote()}</p>
			{/if}
		{:else}
			<p class="meta note">
				The {windowTitle} is not available for this mission{windowState === 'immature' ? ' yet' : ''}.
			</p>
		{/if}
	</figure>
	{/if}
</section>

<style>
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 40px;
	}

	.panel {
		min-width: 0;
	}

	.readout {
		min-height: 16px;
		margin-top: 4px;
		color: var(--dust);
	}

	.plot {
		position: relative;
		margin-top: 8px;
	}

	.canvas {
		width: 100%;
	}

	.note {
		margin-top: 10px;
		max-width: 46em;
	}

	.rule {
		stroke: var(--shadow);
		stroke-width: 1;
	}

	.tick {
		fill: var(--soil);
		font-size: 12px;
	}

	/* each axis is tinted towards its own series: publications grey, citations blue */
	.tick.pub {
		fill: var(--dust);
	}

	.tick.cite {
		fill: var(--neptune-mid);
	}

	.line {
		fill: none;
		stroke-width: 2;
	}

	.line.pub {
		stroke: var(--white);
	}

	.line.cite {
		stroke: var(--neptune);
	}

	.dash {
		stroke-dasharray: 3 3;
	}

	.end {
		font-size: 12px;
	}

	.end.pub {
		fill: var(--white);
	}

	.end.cite {
		fill: var(--neptune-mid);
	}

	.cursor {
		stroke: var(--shadow);
		stroke-width: 1;
	}

	/* Lifecycle dates are context: quiet rules behind both series. */
	.milestone {
		stroke: var(--soil);
		stroke-width: 1;
		stroke-dasharray: 2 3;
	}

	.milestone-label {
		fill: var(--soil);
		font-size: 11px;
	}

	.dot.pub {
		fill: var(--white);
	}

	.dot.cite {
		fill: var(--neptune);
	}

	/* An invisible scrubber gives the readout a real keyboard control; the focus ring the
	   global stylesheet draws on it is the only part that ever shows. */
	.scrub {
		position: absolute;
		margin: 0;
		padding: 0;
		cursor: crosshair;
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
	}

	.scrub::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.scrub::-moz-range-thumb {
		width: 1px;
		height: 1px;
		border: 0;
		opacity: 0;
	}

	/* Early window: a row per year. */
	.years {
		--val: 64px;
		margin-top: 20px;
	}

	.years li {
		display: grid;
		grid-template-columns: 68px 80px minmax(0, 1fr);
		column-gap: 16px;
		align-items: center;
		height: 34px;
	}

	.years .head {
		height: 24px;
		align-items: start;
	}

	.years .first-closed {
		box-shadow: 0 -1px 0 var(--shadow);
	}

	.year {
		color: var(--soil);
		font-size: 12px;
		line-height: 16px;
	}

	.coverage {
		display: block;
		font-size: 10px;
		line-height: 12px;
		white-space: nowrap;
	}

	.pubs {
		text-align: right;
		color: var(--white);
		white-space: nowrap;
	}

	.head .pubs {
		color: var(--dust);
	}

	.pubs .meta {
		display: block;
		white-space: normal;
		line-height: 14px;
	}

	.head .cites {
		color: var(--neptune-mid);
	}

	.track {
		display: flex;
		align-items: center;
		min-width: 0;
	}

	.bar {
		display: flex;
		flex: none;
		height: 14px;
		min-width: 1px;
	}

	.was {
		background: var(--neptune);
		opacity: 0.45;
	}

	.new {
		background: var(--neptune);
	}

	.val {
		padding-left: 8px;
		font-size: 12px;
		color: var(--neptune-mid);
		white-space: nowrap;
	}

	@media (max-width: 480px) {
		.years {
			--val: 56px;
		}

		.years li {
			grid-template-columns: 60px 56px minmax(0, 1fr);
			column-gap: 10px;
		}

		/* the citations heading wraps here */
		.years .head {
			height: auto;
			min-height: 24px;
			padding-bottom: 4px;
		}
	}

	@media (max-width: 860px) {
		.pair {
			grid-template-columns: 1fr;
			gap: 48px;
		}
	}
</style>
