<script>
	import { methodsHref, asset } from '$lib/paths.js';
	import { longDate } from '$lib/format.js';

	let { site } = $props();

	// Mirrors the footer on planetary.org; keep the two in step by hand.
	const TPS = 'https://www.planetary.org';
	const columns = [
		['Explore Space', [
			['Planets & Other Worlds', '/worlds'],
			['Space Missions', '/space-missions'],
			['Night Sky', '/night-sky'],
			['Space Policy', '/space-policy'],
			['For Kids', '/kids']
		]],
		['Learn', [
			['Articles', '/articles'],
			['Planetary Radio', '/planetary-radio'],
			['Space Images', '/space-images'],
			['Videos', '/video'],
			['Courses', '/courses'],
			['The Planetary Report', '/planetary-report']
		]],
		['Get Involved', [
			['Action Center', '/action-center'],
			['Email Signup', '/connect'],
			['Become A Member', '/membership'],
			['Contact', '/about/contact']
		]],
		['Give', [
			['Renew Membership', '/membership'],
			['Support A Project', '/donate'],
			['Shop to Support', '/shop'],
			['Travel', '/travel'],
			['Other Ways to Give', '/giving']
		]]
	];
	const social = [
		['Facebook', 'https://www.facebook.com/planetarysociety', 'facebook'],
		['Bluesky', 'https://bsky.app/profile/planetarysociety.bsky.social', 'bluesky'],
		['X', 'https://x.com/exploreplanets', 'x'],
		['RSS', `${TPS}/rss/articles`, 'rss'],
		['YouTube', 'https://www.youtube.com/user/planetarysociety?sub_confirmation=1', 'youtube'],
		['LinkedIn', 'https://www.linkedin.com/company/the-planetary-society', 'linkedin'],
		['Instagram', 'https://www.instagram.com/planetarysociety/', 'instagram']
	];
	const year = new Date().getFullYear();
</script>

<footer>
	<div class="wrap">
		<hr class="rule" />
		<div class="cols">
			<p>
				<a href={methodsHref()}>How we did this</a>
			</p>
			<p class="meta">
				Data as of {longDate(site.asOf)}.<br />
				{site.attribution.acknowledgement}
				Mission and cost data: {site.attribution.missionMetadataSource}.
			</p>
		</div>
	</div>

	<div class="tps">
		<div class="wrap">
			<nav class="links" aria-label="The Planetary Society">
				{#each columns as [heading, items] (heading)}
					<ul>
						<li class="heading">{heading}</li>
						{#each items as [label, path] (label)}
							<li><a href={TPS + path}>{label}</a></li>
						{/each}
					</ul>
				{/each}
			</nav>

			<div class="brand">
				<div>
					<a href={TPS} aria-label="The Planetary Society">
						<img class="logo" src={asset('img/footer/tps-logo-3stack-white.svg')} alt="" width="192" height="100" />
					</a>
					<p class="tagline">Empowering the world's citizens to advance space science and exploration.</p>
				</div>
				<ul class="social">
					{#each social as [name, href, icon] (icon)}
						<li>
							<a {href} aria-label={name}>
								<img src={asset(`img/footer/${icon}.svg`)} alt="" width="16" height="16" />
							</a>
						</li>
					{/each}
				</ul>
			</div>

			<div class="legal">
				<p class="utility">
					<a href="{TPS}/accountcenter">Account Center</a> •
					<a href="{TPS}/about/contact">Contact Us</a> •
					<a href="{TPS}/privacy-policy">Privacy Policy</a>
				</p>
				<p class="badges">
					<a href="https://www.charitynavigator.org/ein/953423566" target="_blank" rel="noopener noreferrer">
						<img src={asset('img/footer/charity-navigator-4star.png')} alt="Charity Navigator four stars" height="80" />
					</a>
					<a href="https://app.candid.org/profile/8444271/the-planetary-society/" target="_blank" rel="noopener noreferrer">
						<img src={asset('img/footer/guidestar.png')} alt="Guidestar" height="60" />
					</a>
				</p>
				<p class="small">Give with confidence. The Planetary Society is a registered 501(c)(3) nonprofit organization.</p>
				<p class="small">
					&copy; {year} The Planetary Society. All rights reserved.<br />
					<a href="{TPS}/cookie-declaration">Cookie Declaration</a>
				</p>
			</div>
		</div>
	</div>
</footer>

<style>
	footer {
		margin-top: 120px;
	}

	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2.2fr);
		gap: 32px;
		padding: 24px 0 64px;
		align-items: start;
	}

	.meta {
		max-width: 60ch;
	}

	.tps {
		border-top: 1px solid var(--shadow);
		padding: 48px 0;
	}

	.tps a {
		color: var(--white);
	}

	.tps a:hover {
		color: var(--neptune-light);
		text-decoration: none;
	}

	.links {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 32px;
		padding-bottom: 48px;
		border-bottom: 1px solid var(--white);
	}

	.links li {
		padding: 8px 0;
		font-weight: 300;
		letter-spacing: 0.025em;
	}

	.links .heading {
		font-weight: 500;
		text-transform: uppercase;
	}

	.brand {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 32px;
		padding-top: 48px;
	}

	.logo {
		width: 192px;
		height: auto;
	}

	.tagline {
		max-width: 24rem;
		margin-top: 16px;
		font-size: 18px;
		line-height: 1.5;
	}

	.social {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.social a {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 2px solid var(--white);
		border-radius: 50%;
	}

	.social a:hover {
		border-color: var(--neptune-mid);
	}

	.legal {
		padding-top: 72px;
	}

	.utility {
		margin-bottom: 48px;
		font-weight: 500;
	}

	.utility a {
		border-bottom: 1px solid currentColor;
	}

	.utility a:hover {
		border-bottom-color: transparent;
	}

	.badges {
		display: flex;
		align-items: flex-end;
		gap: 10px;
		margin-bottom: 10px;
	}

	.small {
		font-size: 12px;
		line-height: 18px;
	}

	.small a {
		border-bottom: 1px solid currentColor;
	}

	@media (max-width: 720px) {
		.cols,
		.links {
			grid-template-columns: minmax(0, 1fr);
			gap: 16px;
		}

		.tps {
			text-align: center;
		}

		.brand {
			flex-direction: column;
			align-items: center;
		}

		.social,
		.badges {
			justify-content: center;
		}

		.tagline {
			margin-inline: auto;
		}
	}
</style>
