<script>
	// A mission's lifetime accumulation: cumulative publications and citations by calendar year,
	// each against its own axis, both topping out at that series' final total, so the lines meet
	// at the final observed year and the gap between them is the lag. Launch, prime end and
	// mission end are marked; the scope dates themselves head the Key measures table.
	import { scaleLinear } from 'd3-scale';
	import { line } from 'd3-shape';
	import { int, compact, plural, longDate } from '$lib/format.js';
	import { lifetimeModel, axes, lifetimeDomain, missionMilestones, layoutMilestones, stackLabels, box } from './accumulation.js';

	let { lifetime, dates = {} } = $props();

	const HEIGHT = 300;

	const life = $derived(lifetimeModel(lifetime));
	const milestones = $derived(missionMilestones(dates));
	const incomplete = $derived(life?.citationCoverage.status === 'incomplete');
	const coverageNote = $derived(incomplete ? `Citation timeline incomplete: ${int(life.citationCoverage.observed)} of ${int(life.citationCoverage.expected)} reported citations have dated records; ${int(life.citationCoverage.missing)} missing. Headline totals include all reported citations.` : '');

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

	const lifeLabel = $derived(
		life
			? `Cumulative tracked publications and citations, ${life.years[0]} to ${life.years[life.years.length - 1]}: ${int(life.pubTotal)} tracked ${plural(life.pubTotal, 'publication')} and ${int(life.citeTotal)} ${plural(life.citeTotal, 'citation')} in total.${
					milestones.map((m) => ` ${m.label}: ${longDate(m.date)}.`).join('')
				} ${coverageNote}`
			: 'No lifetime series.'
	);

	function scrub(event) {
		if (!life || !L) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const t = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
		const year = L.x.invert(L.b.left + t * (L.b.right - L.b.left));
		hover = life.points.reduce((best, p, i) => Math.abs(p.year - year) < Math.abs(life.points[best].year - year) ? i : best, 0);
	}
</script>

<section>
	<figure>
		<h2 class="chart-title">Lifetime</h2>
		{#if incomplete}<p class="meta note">{coverageNote}</p>{/if}
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
							{@const cx = L.x(point.year)}
							{@const side = cx > (L.b.left + L.b.right) / 2 ? -1 : 1}
							{@const anchor = side > 0 ? 'start' : 'end'}
							<line class="cursor" x1={cx} x2={cx} y1={L.b.top} y2={L.b.bottom} />
							<circle class="dot cite" cx={cx} cy={L.yCite(point.cite)} r="3" />
							<circle class="dot pub" cx={cx} cy={L.yPub(point.pub)} r="3" />
							<!-- Values beside their dots, the year by the axis; the lines are the context. -->
							<text class="hover pub" x={cx + 8 * side} y={L.yPub(point.pub) - 8} text-anchor={anchor}>{int(point.pub)}</text>
							<text class="hover cite" x={cx + 8 * side} y={L.yCite(point.cite) + 16} text-anchor={anchor}>{int(point.cite)}</text>
							<text class="hover meta" x={cx + 8 * side} y={L.b.bottom - 8} text-anchor={anchor}>{point.year}</text>
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
</section>

<style>
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

	.hover { fill: var(--white); font: 500 12px var(--sans); paint-order: stroke; stroke: var(--black); stroke-width: 3px; stroke-linejoin: round; }
	.hover.cite { fill: var(--neptune-mid); }
	.hover.meta { fill: var(--dust); font-weight: 400; }

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
</style>
