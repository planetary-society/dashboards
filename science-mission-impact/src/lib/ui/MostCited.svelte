<script>
	import { adsAbstract, missionHref } from '$lib/paths.js';
	import { byline, int } from '$lib/format.js';

	let { paper, slug = null, missionName = null } = $props();
</script>

{#if paper}
	<aside class="most" aria-labelledby="most-cited-label">
		<div class="text">
			<h2 id="most-cited-label" class="chart-title">Most cited paper</h2>
			<a class="title" href={adsAbstract(paper.bibcode)} rel="noopener">{paper.title}</a>
			<p class="meta">
				{byline(paper.authors, paper.authorCount ?? undefined) || (paper.firstAuthor ?? '')}{paper.year ? ` (${paper.year})` : ''}{#if paper.missionId && slug}, <a href={missionHref(slug, paper.missionId)}>{missionName ?? 'mission page'}</a>{/if}
			</p>
		</div>
		<p class="count">
			<b>{int(paper.citations)}</b>
			<span class="meta">citations</span>
		</p>
	</aside>
{/if}

<style>
	.most {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 16px 48px;
		align-items: end;
		margin-top: 56px;
		padding: 28px 32px 30px;
		background: var(--panel);
		border-left: 3px solid var(--neptune);
	}

	.title {
		display: block;
		margin-top: 10px;
		max-width: 46ch;
		font-weight: 300;
		font-size: clamp(20px, 2.4vw, 28px);
		line-height: 1.3;
		letter-spacing: -0.01em;
		color: var(--white);
		text-wrap: balance;
		overflow-wrap: anywhere;
	}

	.text .meta {
		margin-top: 12px;
		font-size: 14px;
		line-height: 20px;
		color: var(--dust);
	}

	.count {
		text-align: right;
		white-space: nowrap;
	}

	.count b {
		display: block;
		font-weight: 300;
		font-size: clamp(32px, 4vw, 48px);
		line-height: 1;
		letter-spacing: -0.025em;
		color: var(--white);
	}

	.count .meta {
		display: block;
		margin-top: 6px;
	}

	@media (max-width: 640px) {
		.most {
			grid-template-columns: minmax(0, 1fr);
			padding: 22px 20px 24px;
		}

		.count {
			text-align: left;
		}
	}
</style>
