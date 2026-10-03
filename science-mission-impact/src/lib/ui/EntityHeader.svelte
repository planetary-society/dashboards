<script>
	// Header shared by division and mission pages: the name, then one sentence of facts.
	/** second: an optional quieter line under it, already assembled — secondary measures, no emphasis. */
	let { name, crumb = null, thumb = null, children, second = null } = $props();
</script>

<header class="entity">
	{#if crumb}
		<p class="crumb meta"><a href={crumb.href}>{crumb.label}</a></p>
	{/if}
	<div class="title">
		{#if thumb}<img src={thumb} alt="" width="64" height="64" />{/if}
		<h1 class="page-name">{name}</h1>
	</div>
	<p class="fact">{@render children()}</p>
	{#if second}<p class="second">{second}</p>{/if}
	<hr class="rule" />
</header>

<style>
	.entity {
		padding-top: clamp(40px, 7vw, 88px);
	}

	.crumb {
		margin-bottom: 12px;
	}

	.title {
		display: flex;
		align-items: center;
		gap: 20px;
	}

	img {
		flex: none;
		width: 64px;
		height: 64px;
		filter: grayscale(1);
	}

	.fact {
		margin-top: 20px;
	}

	.second {
		margin-top: 12px;
		max-width: 46em;
		color: var(--soil);
	}

	.rule {
		margin-top: clamp(32px, 5vw, 56px);
	}

	@media (max-width: 600px) {
		img {
			width: 44px;
			height: 44px;
		}
	}
</style>
