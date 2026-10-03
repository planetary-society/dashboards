<script>
	// Key for the time-on-cost-axis chart: first-paper states plus its build-time hairlines.
	import { LANE_LABELS } from '$lib/copy/outcomes.js';
</script>

<ul class="key meta">
	<li><span class="sw mark-reached"></span>{LANE_LABELS.reached}</li>
	<li><span class="build"></span>Years to build, above the line</li>
	<li><span class="sw mark-none"></span>{LANE_LABELS.none}</li>
	<li><span class="sw mark-no_papers"></span>{LANE_LABELS.no_papers}</li>
	<li><span class="sw mark-failure"></span>{LANE_LABELS.failure}</li>
	<li><span class="sw mark-unavailable"></span>{LANE_LABELS.unavailable}</li>
</ul>

<style>
	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 18px;
	}

	.key li {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.sw {
		display: inline-block;
		width: 9px;
		height: 9px;
	}

	.build {
		display: inline-block;
		width: 1px;
		height: 12px;
		background: var(--outline-filled);
	}
</style>
