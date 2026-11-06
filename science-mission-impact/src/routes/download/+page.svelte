<script>
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import { fullWindowLabel } from '$lib/copy/window.js';
	import { fileSize, int, listify, longDate, spell } from '$lib/format.js';
	import { exportUrl, methodsHref } from '$lib/paths.js';

	let { data } = $props();
	const manifest = $derived(data.manifest);
	const dictionary = $derived(data.dictionary);
	const files = $derived(new Map(manifest.files.map((file) => [file.filename, file])));
	const divisions = $derived(data.site.divisions);
	const groups = $derived(divisions.map((d) => ({ ...d,
		missions: manifest.files.filter((file) => file.division === d.slug && file.mission).sort((a, b) => a.name.localeCompare(b.name))
	})).filter((d) => d.missions.length));
	let picked = $state({ division: null, mission: null });
	const division = $derived(divisions.find((d) => d.slug === picked.division) ?? divisions[0]);
	const mission = $derived(manifest.files.find((file) => file.mission === picked.mission) ?? groups[0]?.missions[0]);
	const description = 'Download NASA science mission costs, publications, and citation measures as CSV and JSON, with a data dictionary, source information, and citation guidance.';
	const citation = $derived(`${listify(manifest.creators)}. ${manifest.name}. The Planetary Society. Data as of ${manifest.asOf}, version ${manifest.version}. ${manifest.landingPage}`);
	// Escaping '<' keeps dataset values from terminating the JSON-LD script element.
	const jsonLd = $derived(JSON.stringify(data.dataset).replace(/</g, '\\u003c'));
</script>

{#snippet download(filename, label)}
	{@const file = files.get(filename)}
	{#if file}<a class="link" href={exportUrl(filename)} download={filename}>{label} ({file.format.split('/')[1].toUpperCase()}, {fileSize(file.bytes)})</a>{/if}
{/snippet}

<Seo title="NASA Science Mission Impact Dataset: CSV Downloads" {description} />
<svelte:head>
	{@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

<div class="wrap page">
	<EntityHeader name="Download" />
	<div class="body">
		<section>
			<h2>Entire dataset (data as of {longDate(manifest.asOf)}.)</h2>
			<div class="item">
				{@render download('science-mission-impact-missions.csv', 'All missions summary')}
				<p>Each mission across every division: with LCC, status, selection, and key dates, plus its paper count, citation count,
					and high-impact papers in the {fullWindowLabel} and over its lifetime. {int(files.get('science-mission-impact-missions.csv').rows)} rows.</p>
			</div>
			<div class="item">
				{@render download('science-mission-impact-publications.zip', 'All tracked publications')}
				<p>One CSV, zipped, with one row per mission and paper, so a paper credited to two missions appears twice.
					Filter its <code>division</code> column for one division’s papers. {int(files.get('science-mission-impact-publications.zip').rows)} rows.</p>
			</div>
			<div class="item">
				{@render download('science-mission-impact-clps.csv', 'Commercial lunar landers')}
				<p>The {spell(data.landers)} Commercial Lunar Payload Services (CLPS) landers flew too recently to be included in our primary analysis, so they have their own file.</p>
			</div>
			<p><a href={exportUrl('manifest.json')}>File manifest (JSON)</a> · <a href={exportUrl('dictionary.json')}>Data dictionary (JSON)</a></p>
			<p class="meta">The manifest lists every file’s URL, row count, size, SHA-256 checksum, and associated pages. These URLs serve the latest snapshot.</p>
		</section>

		<section>
			<h2>By division</h2>
			<div class="field">
				<label for="download-division">Division</label>
				<select id="download-division" value={division.slug} onchange={(e) => (picked.division = e.currentTarget.value)}>
					{#each divisions as d (d.slug)}<option value={d.slug}>{d.name}</option>{/each}
				</select>
			</div>
			{@render download(`${division.slug}-missions.csv`, 'Missions')}
		</section>

		<section>
			<h2>By mission</h2>
			{#if mission}
				<div class="field">
					<label for="download-mission">Mission</label>
					<select id="download-mission" value={mission.mission} onchange={(e) => (picked.mission = e.currentTarget.value)}>
						{#each groups as g (g.slug)}
							<optgroup label={g.name}>
								{#each g.missions as m (m.mission)}<option value={m.mission}>{m.name}</option>{/each}
							</optgroup>
						{/each}
					</select>
				</div>
				{@render download(mission.filename, 'Tracked publications')}
				<a href={mission.json}>Publication data (JSON)</a>
			{/if}
			<p>Missions with no tracked publications aren’t listed.</p>
		</section>

		<section id="citation">
			<h2>Cite this dataset</h2>
			<p>{citation}</p>
			<p class="meta">The version identifies the exported data and dictionary. Older snapshots are not retained at these download URLs.</p>
		</section>

		<section id="reuse">
			<h2>Reuse and sources</h2>
			<p>{manifest.rights} <a href={manifest.license}>Read CC BY 4.0</a>.</p>
			<p>{manifest.source.acknowledgement} <a href={manifest.source.terms}>SciX/ADS source terms</a>.</p>
			<p>Mission and cost data: {manifest.source.missionMetadata}. <a href={methodsHref()}>Methods</a> · <a href={manifest.source.dashboardCode}>Dashboard source code</a>.</p>
			<p class="meta">Upstream analysis revision: <code>{manifest.source.codeRevision || 'Not supplied'}</code>{manifest.source.codeRevisionDirty ? ' (included uncommitted changes)' : ''}.</p>
		</section>

		<section id="data-dictionary">
			<h2>Data dictionary</h2>
			{#each dictionary.notes as note}<p>{note}</p>{/each}
			<h3>Measurement scopes</h3>
			<p><strong>Active Mission Window.</strong> {dictionary.scopes.active}</p>
			<p><strong>Lifetime.</strong> {dictionary.scopes.lifetime}</p>
			<h3>Fields</h3>
			<p class="meta">CSV columns, and the columns of each mission’s publication JSON, which names them the same way.</p>
			<dl>{#each Object.entries(dictionary.fields) as [field, definition]}<dt><code>{field}</code></dt><dd>{definition}</dd>{/each}</dl>
		</section>
	</div>
</div>

<style>
	.body { max-width: 68ch; font-size: 16px; line-height: 1.8; }
	section { margin-top: 56px; scroll-margin-top: calc(var(--nav-h) + 24px); }
	h2 { font-size: 24px; font-weight: 400; line-height: 1.4; margin-bottom: 16px; }
	h3 { font-size: 18px; font-weight: 400; margin: 28px 0 12px; }
	.item + .item { margin-top: 24px; }
	p + p { margin-top: 16px; }
	code { overflow-wrap: anywhere; }
	dt { margin-top: 16px; }
	dd { color: var(--dust); margin-left: 0; }
	.link { display: block; min-height: 44px; color: var(--neptune-mid); font-size: 14px; text-decoration: underline; text-underline-offset: 3px; }
	.field { max-width: 360px; margin-bottom: 8px; }
	label { display: block; color: var(--soil); font-size: 14px; line-height: 20px; }
	select {
		display: block; width: 100%; min-height: 44px; font: inherit; color: var(--white);
		background: var(--black) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%238c8c8c' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 4px center / 12px 8px;
		border: 0; border-bottom: 1px solid var(--shadow); border-radius: 0; padding: 0 28px 0 0;
		text-overflow: ellipsis; cursor: pointer; -webkit-appearance: none; appearance: none;
	}
	select:hover { border-bottom-color: var(--soil); }
	option, optgroup { background: var(--black); }
	@media (max-width: 600px) { section { margin-top: 40px; } }
</style>
