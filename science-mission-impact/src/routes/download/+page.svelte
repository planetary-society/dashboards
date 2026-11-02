<script>
	// Every CSV the site offers, in one place: the division and mission pages' own downloads, and the
	// same files joined across divisions, each row led by the columns that say where it came from.
	// Mission tables are built from the page's data and the CLPS landers' file comes ready-made; paper
	// files are fetched on request and joined here.
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import { fullWindowLabel } from '$lib/copy/window.js';
	import { fileSize, int, longDate, plural, spell } from '$lib/format.js';
	import { allMissionsCsv, hasPapers, publicationsCsv } from '$lib/mission/papers.js';
	import { downloadText } from '$lib/download.js';
	import { paperCsv, tableCsv } from './files.js';

	let { data } = $props();
	const site = $derived(data.site);
	const divisions = $derived(data.divisions);
	// each file’s size, measured at prerender, for its button’s label
	const sizes = $derived(data.sizes);
	const csvLabel = (bytes) => `(CSV, ${fileSize(bytes)})`;
	const description = 'Download the Science Mission Impact data as CSV files: every mission’s cost, status, and citation measures, and every tracked publication.';

	const missions = $derived(divisions.flatMap((d) => d.missions));
	const missionCount = $derived(missions.length);
	const publicationRows = $derived(missions.reduce((n, m) => n + (hasPapers(m) ? m.lifetime.papers : 0), 0));
	/** The mission picker: each division's missions with a paper file, by name. */
	const groups = $derived(
		divisions
			.map((d) => ({ slug: d.slug, name: d.name, missions: d.missions.filter(hasPapers).sort((a, b) => a.name.localeCompare(b.name)) }))
			.filter((g) => g.missions.length)
	);

	// Each picker starts on its first option until the reader changes it.
	let picked = $state({ division: null, mission: null });
	const division = $derived(divisions.find((d) => d.slug === picked.division) ?? divisions[0]);
	const missionId = $derived(picked.mission ?? groups[0]?.missions[0]?.id);

	// One download at a time: while one prepares, every button waits, and the line under the button
	// pressed says how far it has got, or that it failed.
	let busy = $state(false);
	let status = $state({ key: null, text: '' });

	const allMissions = () => downloadText(allMissionsCsv(divisions, divisions.map(tableCsv)), 'science-mission-impact-missions.csv');
	const divisionMissions = () => downloadText(tableCsv(division), `${division.slug}-missions.csv`);
	const landers = () => downloadText(data.clps, 'science-mission-impact-clps.csv');

	/**
	 * Fetches the paper files of `ids` all at once (the browser queues them per host), reporting under the
	 * button `key`, then hands their CSVs, in the order given, to `save`. A failure says so there, and
	 * `failed` keeps a later file's progress from writing over it.
	 */
	async function prepare(key, ids, save) {
		busy = true;
		let done = 0;
		let failed = false;
		const report = () => {
			if (!failed) status = { key, text: `Preparing… ${int(done)} of ${int(ids.length)} ${plural(ids.length, 'mission')}` };
		};
		report();
		try {
			save(await Promise.all(ids.map((id) => paperCsv(id).then((csv) => (done += 1, report(), csv)))));
			status = { key: null, text: '' };
		} catch {
			failed = true;
			status = { key, text: 'Couldn’t load the data. Please try again.' };
		} finally {
			busy = false;
		}
	}

	/** Every paper of `list`'s missions, in division order then each division's own mission order. */
	function publications(key, list, filename) {
		const ids = list.flatMap((d) => d.missions.filter(hasPapers).map((m) => m.id));
		prepare(key, ids, (csvs) => {
			const byId = new Map(ids.map((id, k) => [id, csvs[k]]));
			downloadText(publicationsCsv(list, (id) => byId.get(id)), filename);
		});
	}

	/** As the mission page's paper list writes it: no lead columns. */
	function missionPublications() {
		const id = missionId;
		prepare('mission', [id], ([csv]) => downloadText(csv, `${id}-publications.csv`));
	}
</script>

{#snippet action(key, label, onclick)}
	<button type="button" class="link" disabled={busy} {onclick}>{label}</button>
	<p class="status" aria-live="polite">{status.key === key ? status.text : ''}</p>
{/snippet}

<Seo title="Download" {description} />

<div class="wrap page">
	<EntityHeader name="Download">
	</EntityHeader>

	<div class="body">
		<section>
			<h2>Entire dataset (data as of {longDate(site.asOf)}.)</h2>
			<div class="item">
				{@render action('all-missions', `All missions summary ${csvLabel(sizes.allMissions)}`, allMissions)}
				<p>Each mission across every division: with LCC, status, selection, and key dates, plus its paper count, citations count,
					and high-impact papers in the {fullWindowLabel} and over its lifetime. {int(missionCount)} rows.</p>
			</div>
			<div class="item">
				{@render action('all-publications', `All tracked publications ${csvLabel(sizes.allPublications)}`, () =>
					publications('all-publications', divisions, 'science-mission-impact-publications.csv'))}
				<p>One row per mission and paper, so a paper credited to two missions appears twice.
					{int(publicationRows)} rows.</p>
			</div>
			<div class="item">
				{@render action('clps', `Commercial lunar landers ${csvLabel(sizes.clps)}`, landers)}
				<p>The {spell(data.landers)} Commercial Lunar Payload Services (CLPS) landers flew too recently to be included in our primary analysis, so they have their own file.</p>
			</div>
		</section>

		<section>
			<h2>By division</h2>
			<div class="field">
				<label for="download-division">Division</label>
				<select id="download-division" value={division.slug} onchange={(e) => (picked.division = e.currentTarget.value)}>
					{#each divisions as d (d.slug)}
						<option value={d.slug}>{d.name}</option>
					{/each}
				</select>
			</div>
			{@render action('division-missions', `Missions ${csvLabel(sizes.divisions[division.slug].missions)}`, divisionMissions)}
			{@render action('division-publications', `Tracked publications ${csvLabel(sizes.divisions[division.slug].publications)}`, () =>
				publications('division-publications', [division], `${division.slug}-publications.csv`))}
		</section>

		<section>
			<h2>By mission</h2>
			<div class="field">
				<label for="download-mission">Mission</label>
				<select id="download-mission" value={missionId} onchange={(e) => (picked.mission = e.currentTarget.value)}>
					{#each groups as g (g.slug)}
						<optgroup label={g.name}>
							{#each g.missions as m (m.id)}
								<option value={m.id}>{m.name}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</div>
			{@render action('mission', `Tracked publications ${csvLabel(sizes.missions[missionId])}`, missionPublications)}
			<p>Missions with no tracked publications aren’t listed.</p>
		</section>
	</div>
</div>

<style>
	.body { max-width: 68ch; font-size: 16px; line-height: 1.8; }
	section { margin-top: 56px; }
	h2 { font-size: 24px; font-weight: 400; line-height: 1.4; margin-bottom: 16px; }
	.item + .item { margin-top: 24px; }

	/* MissionTable's "Download CSV" link-button */
	.link {
		display: block;
		min-height: 44px;
		color: var(--neptune-mid);
		font-size: 14px;
		text-align: left;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.link:disabled {
		color: var(--soil);
		cursor: progress;
	}

	/* empty, and so no height, until its button is pressed */
	.status { font-size: 14px; line-height: 20px; color: var(--dust); }
	.status:not(:empty) { margin-bottom: 8px; }

	.field { max-width: 360px; margin-bottom: 8px; }
	label { display: block; color: var(--soil); font-size: 14px; line-height: 20px; }

	/* PaperBrowser's search field: white on the black page over one hairline, with a quiet chevron */
	select {
		display: block;
		width: 100%;
		min-height: 44px;
		font: inherit;
		color: var(--white);
		background: var(--black) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%238c8c8c' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 4px center / 12px 8px;
		border: 0;
		border-bottom: 1px solid var(--shadow);
		border-radius: 0;
		padding: 0 28px 0 0;
		text-overflow: ellipsis;
		cursor: pointer;
		-webkit-appearance: none;
		appearance: none;
	}

	select:hover { border-bottom-color: var(--soil); }
	option, optgroup { background: var(--black); color: var(--white); }

	@media (max-width: 600px) {
		section { margin-top: 40px; }
	}
</style>
