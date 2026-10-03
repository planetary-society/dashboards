<script>
	import { methodsHref } from '$lib/paths.js';
	import { longDate } from '$lib/format.js';

	let { site } = $props();
</script>

<footer>
	<div class="wrap">
		<hr class="rule" />
		<div class="cols">
			<p>
				<a href={methodsHref()}>How we did this</a>
			</p>
			<p class="meta">
				Preliminary. Data as of {longDate(site.asOf)}.<br />
				{site.attribution.acknowledgement}
				Mission and cost data: {site.attribution.missionMetadataSource}.
			</p>
			<p class="meta">
				<a href="https://www.planetary.org/">The Planetary Society</a>
			</p>
		</div>
	</div>
</footer>

<style>
	footer {
		margin-top: 120px;
		padding-bottom: 64px;
	}

	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2.2fr) auto;
		gap: 32px;
		padding-top: 24px;
		align-items: start;
	}

	.meta {
		max-width: 60ch;
	}

	@media (max-width: 720px) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
			gap: 16px;
		}
	}
</style>
