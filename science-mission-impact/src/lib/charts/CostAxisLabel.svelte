<script>
	// The label under a story cost axis (COST_AXIS_LABEL), centred under the plot inside the bottom
	// margin costAxisBottom() keeps for it. The lanes and the per-dollar charts put it in the same
	// place, so it holds still between their steps.
	import { COST_AXIS_LABEL } from './costaxis.js';

	/** x0, x1: the plot's pixel range. floor: the axis line's y. compact: a phone's sizes. */
	let { x0, x1, floor, compact = false } = $props();
</script>

<span class="cost-axis-label" class:compact style:left="{(x0 + x1) / 2}px" style:top="{floor + (compact ? 21 : 22)}px">{COST_AXIS_LABEL}</span>

<style>
	.cost-axis-label {
		position: absolute;
		transform: translateX(-50%);
		font-size: 12px;
		line-height: 16px;
		color: var(--dust);
		white-space: nowrap;
	}

	.cost-axis-label.compact {
		font-size: 11px;
		line-height: 14px;
	}
</style>
