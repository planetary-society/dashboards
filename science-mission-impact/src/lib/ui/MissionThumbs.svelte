<script>
	// Every mission in the division as its picture, earliest launch first: a visual index of the
	// page. Each links to its mission page.
	import { missionHref, thumbSrc } from '$lib/paths.js';
	import { money } from '$lib/format.js';

	let { missions, slug } = $props();
	const byLaunch = (a, b) => (a.launchYear ?? Infinity) - (b.launchYear ?? Infinity) || a.name.localeCompare(b.name);
	const sorted = $derived(missions.slice().sort(byLaunch));
</script>

<ul class="thumbs">
	{#each sorted as m (m.id)}
		<li>
			<a href={missionHref(slug, m.id)} title="{m.name}, launched {m.launchYear ?? 'date unknown'}, {money(m.cost)}">
				{#if m.hasThumb}<img src={thumbSrc(m.id)} alt="" width="64" height="64" loading="lazy" />{:else}<span class="blank"></span>{/if}
				<span class="name">{m.name}</span>
			</a>
		</li>
	{/each}
</ul>

<style>
	.thumbs {
		display: flex;
		flex-wrap: wrap;
		gap: 16px 12px;
	}

	li {
		width: 72px;
	}

	a {
		display: block;
		color: var(--dust);
	}

	img,
	.blank {
		display: block;
		width: 64px;
		height: 64px;
		background: var(--square);
		filter: grayscale(1);
		box-shadow: inset 0 0 0 1px var(--outline);
		transition: filter 200ms linear;
	}

	a:hover img,
	a:focus-visible img {
		filter: none;
	}

	.name {
		display: -webkit-box;
		margin-top: 6px;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		font-size: 12px;
		line-height: 16px;
	}

	a:hover .name {
		color: var(--white);
	}

	@media (max-width: 600px) {
		.thumbs {
			gap: 12px 8px;
		}

		li {
			width: 60px;
		}

		img,
		.blank {
			width: 56px;
			height: 56px;
		}
	}
</style>
