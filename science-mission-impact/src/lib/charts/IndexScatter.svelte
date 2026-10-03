<script>
	// The paper's own measures — m-index and h-index — against what each mission cost. They are
	// here because the paper reports them, not because the site ranks by them: the ranking measure
	// is the top 10% within a division. One mark per mission, cost on a log axis, no fitted curve.
	import Choice from '$lib/ui/Choice.svelte';
	import DollarMinorTicks from './DollarMinorTicks.svelte';
	import Squares from '$lib/scrolly/Squares.svelte';
	import MissionReadout from '$lib/ui/MissionReadout.svelte';
	import { missionHref } from '$lib/paths.js';
	import { money, longDate, plural } from '$lib/format.js';
	import { scatterModel, correlationText, indexValue, tickValue, otherIndex, INDEX_LABEL } from './indexscatter.js';

	let { missions, correlation, slug, asOf, selectedId = '', onselect = null } = $props();

	// Local, not the shared view state: this choice belongs to this chart and to no URL.
	let index = $state('m');
	let width = $state(0);
	let height = $state(0);

	const other = $derived(otherIndex(index));
	const m = $derived(scatterModel(missions, index));
	const rho = $derived(correlationText(correlation?.[index]));
	const tiles = $derived(missions.map((mission) => ({ ...mission, division: slug })));
	const items = $derived(new Map((m?.points ?? []).map((p) => [p.id, {
		x: p.x / 100 * width - (width < 560 ? 2.5 : 4),
		y: (1 - p.y / 100) * height - (width < 560 ? 2.5 : 4),
		s: width < 560 ? 5 : 8, variant: p.failed ? 'failure' : 'reached', label: describe(p)
	}])));
	const selected = $derived(m?.points.find((p) => p.id === selectedId));

	function describe(p) {
		if (p.value == null) return `${p.name}: ${money(p.cost)}, failed with no qualifying papers`;
		const paren = p.other != null ? ` (${INDEX_LABEL[other]} ${indexValue(other, p.other)})` : '';
		return `${p.name}: ${money(p.cost)}, ${INDEX_LABEL[index]} ${indexValue(index, p.value)}${paren}${p.failed ? ', mission failed' : ''}`;
	}

	const summary = $derived(
		m
			? `${INDEX_LABEL[index]} by mission cost for ${m.points.length} ${plural(m.points.length, 'mission')}, as of ${longDate(asOf)}. Costs run from ${money(m.costs[0])} to ${money(m.costs[1])}, and the ${INDEX_LABEL[index]} from 0 to ${indexValue(index, m.maxValue)}.${m.failed ? ` ${m.failed} failed ${plural(m.failed, 'mission')} ${m.failed === 1 ? 'counts as a zero' : 'count as zeros'}.` : ''} ${rho}`
			: ''
	);
</script>

<h2 class="chart-title">
	<Choice
		label="Measure"
		value={index}
		onchange={(v) => (index = v)}
		options={[
			{ value: 'm', label: 'm-index' },
			{ value: 'h', label: 'h-index' }
		]}
	/>
	by mission cost, as of {longDate(asOf)}
</h2>
<p class="rho meta">{rho}</p>

{#if !m}
	<p class="fact none">No missions with a cost and a measure.</p>
{:else}
	<figure class="scatter">
		<MissionReadout id={selectedId} {slug} label={selected ? describe(selected) : 'Selected mission: this measure is unavailable.'} />
		<p class="sr-only">{summary}</p>

		<!-- plot and axis share one grid so a tick label sits over the cost it names -->
		<div class="frame">
			<div class="ylabels meta" aria-hidden="true">
				{#each m.yTicks as t (t.value)}
					<span style:bottom="{t.pct}%">{tickValue(t.value)}</span>
				{/each}
			</div>
			<div class="area" bind:clientWidth={width} bind:clientHeight={height}>
				{#each m.yTicks as t (t.value)}
					<span class="grid" style:bottom="{t.pct}%" aria-hidden="true"></span>
				{/each}
				{#if width && height}
					<Squares {tiles} {items} thumbnailBorders {selectedId} {onselect} />
				{:else}
					{#each m.points as p (p.id)}<a class="sr-only mark-{p.failed ? 'failure' : 'reached'}" href={missionHref(slug, p.id)} aria-label={describe(p)}>{p.name}</a>{/each}
				{/if}
			</div>

			<div aria-hidden="true"></div>
			<div class="xaxis meta" aria-hidden="true">
				<DollarMinorTicks positions={m.xMinorPositions} unit="%" top={0} />
				{#each m.xTicks as t (t.value)}
					<span style:left="{t.pct}%">{money(t.value)}</span>
				{/each}
			</div>
		</div>
		<p class="ends meta" aria-hidden="true">Mission cost, log scale</p>
	</figure>
{/if}

<style>
	.rho {
		margin-top: 8px;
		color: var(--dust);
	}

	.scatter {
		--ygutter: 40px;
		margin-top: 12px;
		max-width: 760px;
	}

	.frame {
		display: grid;
		grid-template-columns: var(--ygutter) minmax(0, 1fr);
		grid-template-rows: 320px 24px;
		margin-top: 8px;
		/* a mark sits astride its own coordinate; this keeps the right-hand ones off the page edge */
		padding-right: 6px;
	}

	.ylabels,
	.area {
		position: relative;
	}

	.ylabels span {
		position: absolute;
		right: 8px;
		transform: translateY(50%);
	}

	.area {
		border-bottom: 1px solid var(--soil);
	}

	.grid {
		position: absolute;
		left: 0;
		right: 0;
		height: 1px;
		background: var(--shadow);
	}

	.xaxis {
		position: relative;
		padding-top: 6px;
	}

	.xaxis span {
		position: absolute;
		transform: translateX(-50%);
		white-space: nowrap;
	}

	.ends {
		margin: 2px 0 0 var(--ygutter);
		color: var(--dust);
	}

	.none {
		margin-top: 16px;
	}

	@media (max-width: 560px) {
		.scatter {
			--ygutter: 30px;
		}

		.frame {
			grid-template-rows: 240px 24px;
		}
	}
</style>
