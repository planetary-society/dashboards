import{A as e,D as t,E as n,H as r,J as i,K as a,L as o,N as s,O as c,Y as l,at as u,et as d,nt as f,ot as p,p as m,q as h,rt as g,w as _}from"../chunks/k_MmgXg0.js";import"../chunks/xihTtKlq.js";import{a as v,i as y,o as b,r as x,u as S}from"../chunks/Cqt0wU_u.js";import{c as ee,n as te,t as ne}from"../chunks/C2P2EJ7O.js";import{t as re}from"../chunks/0PjKEAax.js";var ie=e(`<li class="svelte-1r4fau9"><a> </a> <p class="svelte-1r4fau9"> <i> </i>.</p></li>`),ae=e(`<!> <div class="wrap page"><!> <div class="body svelte-1r4fau9"><section id="challenges" class="svelte-1r4fau9"><h2 class="svelte-1r4fau9">The challenges of bibliometrics for space science missions</h2> <p class="svelte-1r4fau9">Space is hard, as the saying goes. So is measuring a space mission’s scientific output.</p> <p class="svelte-1r4fau9">There is no perfect collection of science publications associated with a mission; there are
				only degrees of correctness. Large missions, like the Hubble Space Telescope, dedicate staff
				time to identifying science papers and distinguishing results from engineering descriptions
				and speculative work. A <a href="https://arxiv.org/abs/2402.12818">European team studying ESA’s
				space science missions</a> describes a transition from manual review to machine learning and
				natural language processing, with scientists still validating the selections. Such assessments
				can require access to the full text of large numbers of publications, often shielded by paywalls.</p> <p class="svelte-1r4fau9">Exactly how one defines “science” varies, and many judgment calls are required. For this study,
				we used a simpler approach also used in many peer-reviewed publications, such as <a href="https://doi.org/10.1016/j.spacepol.2025.101713">Fiore &amp; Elvis (2026)</a>: querying
				NASA’s Astrophysics Data System (ADS)/SciXplorer database by mission name and the names of its
				primary instruments. ADS is the leading repository of space science publication and citation
				references. This approach assesses the signal of a mission within the abstract literature,
				using publications as a proxy for scientific productivity and citations to those publications
				as a proxy for impact.</p> <p class="svelte-1r4fau9">We tailor each query to filter out obvious false positives from name or acronym collisions:
				TRACE, for example, is both a space mission and a very common word. We also compared our query
				outcomes to the managed collections of several missions with hand-curated publication sets. They
				generally agree within 10%–25% of publication records, with a single exception, GALEX, differing
				by a wide amount due to the pattern of not reporting the mission name in many abstracts. Since we’re
				primarily comparing mission costs across orders of magnitude, this is well within acceptable limits.
				We tested our outcomes with curated mission collections and found the overall comparative outcomes
				remained consistent.</p> <p class="svelte-1r4fau9">Our aim is to identify broad patterns in the research associated with these missions. We call
				these records “tracked publications” to make their scope clear: they capture the papers we found,
				while leaving room for omissions and corrections. The methods below explain how we select
				missions, count their publications and citations, and compare costs and time.</p></section> <section id="missions" class="svelte-1r4fau9"><h2 class="svelte-1r4fau9">What we included</h2> <p class="svelte-1r4fau9">This dataset contains <b> </b> </p> <p class="svelte-1r4fau9">Comparisons stay within each division. Research communities differ in size, publishing practices,
				and citation rates, so a higher count in one field does not mean its science is more valuable.</p></section> <section id="mission-papers" class="svelte-1r4fau9"><h2 class="svelte-1r4fau9">Tracked publications</h2> <p class="svelte-1r4fau9"><b>Tracked publications are the peer-reviewed research papers we found for each mission.</b> </p> <p class="svelte-1r4fau9">We use mission-specific searches in NASA’s Astrophysics Data System (ADS), now available through <a href="https://scixplorer.org/">SciX</a>. Searches look for mission and instrument names in titles,
				abstracts, and keywords, with topic restrictions to distinguish ambiguous acronyms. Mission
				bibliographies help identify omissions; additions and exclusions are reviewed individually.</p> <p class="svelte-1r4fau9">This approach can miss papers that use mission data without naming the source in those fields.
				A name match alone also does not establish that a paper used the data.</p> <h3 id="removed" class="svelte-1r4fau9">What we exclude</h3> <p>We have general exclusions for non-refereed material, conference proceedings, news articles, and records for
				datasets or catalogs.</p> <h3 id="start" class="svelte-1r4fau9">When tracking begins</h3> <p>Queries are time-bound by the first full month after prime science operations start, or launch
				date if no prime mission start is published. This reduces pre-launch and overview material; it does not eliminate
				every false match. For missions with long cruises or flyby results, we include results published
				before the prime mission start.</p></section> <section id="high-impact" class="svelte-1r4fau9"><h2 class="svelte-1r4fau9">Citations and credit</h2> <p class="svelte-1r4fau9">Publication counts describe research output. Citations describe how often later papers refer
				to that work—a measure of research attention, not a direct measure of discovery, correctness,
				or societal benefit. Citation counts include self-citations.</p> <p class="svelte-1r4fau9"><b>Top-10% papers</b> </p> <p class="svelte-1r4fau9"><b>Top-paper credit</b> can be fractional. Papers tied at the cutoff share the remaining credit,
				and a paper attributed to several eligible missions shares its credit equally among them.</p> <h3 class="svelte-1r4fau9">Shared papers and percentile rules</h3> <p class="svelte-1r4fau9">Each distinct paper appears once in its division’s reference pool. Mission publication counts
				count whole papers, so adding mission totals can count a shared paper more than once. Top-paper
				credit is divided only among eligible missions in the same division and comparison window.</p> <p class="svelte-1r4fau9">Papers above a percentile cutoff receive full credit. Tied papers at the boundary share the
				amount needed to reach the stated percentage. A short final year band joins the preceding
				band; a small reference may remain below the target size.</p> <p class="svelte-1r4fau9">The top 1% uses the division’s pooled citation distribution, without publication-year adjustment,
				and is available only in the two windowed comparisons. It is a different reference from the
				era-adjusted top 10%.</p></section> <section id="windows" class="svelte-1r4fau9"><h2 class="svelte-1r4fau9">Comparison windows</h2> <p>Older papers have had more time to collect citations. Windowed comparisons give each paper
				a defined citation period, while lifetime totals show the accumulated record.</p> <h3 id="full-window" class="svelte-1r4fau9"> </h3> <p> <!>.</p> <h3 id="early-window" class="svelte-1r4fau9"> </h3> <p> </p> <h3 class="svelte-1r4fau9">Lifetime</h3> <p>All tracked publications and their reported citations to date.</p></section> <section id="cost" class="svelte-1r4fau9"><h2 class="svelte-1r4fau9">Mission costs</h2> <p class="svelte-1r4fau9">Costs come from the mission catalog’s reported life-cycle costs, including documented partner
				contributions where available. These generally cover development, payloads, launch, and prime
				operations. Values are adjusted to <b> </b> using NASA’s <a href="https://www.nasa.gov/wp-content/uploads/2024/11/nnsi-faqs-2024.pdf">New Start Inflation Index</a>.
				These are the dataset’s adjusted life-cycle costs; for CubeSats they may not include a rideshare
				launch or university labor.</p> <p class="svelte-1r4fau9"> </p></section> <section id="failures" class="svelte-1r4fau9"><h2 class="svelte-1r4fau9">Failed and partly successful missions</h2> <p class="svelte-1r4fau9"> </p> <p class="svelte-1r4fau9">Missions recorded as a Failure stay in every comparison with whatever they published; one that
				returned nothing counts as zero output, so a lost spacecraft lowers its group’s average rather than
				leaving it. Missions whose output could not be
				measured, such as a window too young to score, missing mission dates or a citation history that
				cannot be checked, are
				left out rather than counted as zero, as are missions without a reported cost in any cost
				comparison.</p></section> <section id="across-divisions" class="svelte-1r4fau9"><h2 class="svelte-1r4fau9">Figures across divisions</h2> <p class="svelte-1r4fau9">Top-10% status is always decided within a division and is era-adjusted, as described under <a href="#high-impact">Citations and credit</a>. Shares of a division’s top-10% papers are never
				added up across fields. Where the overview counts top-10% papers from several divisions together
				(a mission’s share of all the top-10% papers from its cost group, or the share of that credit on
				papers of a given kind), each paper was ranked within its own division first and the text says
				which group it covers. Study-wide paper totals count each distinct paper once; where a figure
				counts a shared paper once per mission, it is called mission papers.</p> <p class="svelte-1r4fau9"><b>Where the middle half of top papers sits.</b> Within each division, missions are ordered by
				adjusted cost and the division’s top-10% credit is accumulated as a running share. The band across
				divisions averages those running shares with each division weighted equally, at every cost where
				any of them has a mission. Its quarter marks are the costs at which that average first reaches
				25%, 50% and 75%. A division with no top-10% credit is left out.</p> <p class="svelte-1r4fau9"><b>At or below the line, and above it.</b> </p></section> <section id="reproduce" class="svelte-1r4fau9"><h2 class="svelte-1r4fau9">Sources and snapshot</h2> <p class="svelte-1r4fau9">Mission dates and costs come from public NASA records.
				Publication records come from ADS/SciX. Mission pages provide the available query, curation
				decisions, tracked publication list, and CSV download.</p> <p class="svelte-1r4fau9">The analysis snapshot is <b> </b> <!>.
				Live searches may differ as the literature and its indexing change; an exact reproduction needs
				this snapshot and its curation decisions.</p> <p class="svelte-1r4fau9"> <a>ADS terms of use</a> and <a href="https://scixplorer.org/scixhelp/search-scix/search-syntax">SciX search documentation</a>.</p></section> <section id="citing" class="svelte-1r4fau9"><h2 class="svelte-1r4fau9">Corrections</h2> <p>If you find a missing or misattributed paper, a wrong date or cost, or any other error, write to <a></a>. Mission pages list the query and every
				tracked publication, which makes a specific correction easy to check.</p></section> <section id="image-credits" class="svelte-1r4fau9"><h2 class="svelte-1r4fau9">Image credits</h2> <p>NASA/ESA.</p></section> <section id="further-reading" class="svelte-1r4fau9"><h2 class="svelte-1r4fau9">Further reading</h2> <ul class="reading svelte-1r4fau9"></ul></section></div></div>`,1);function C(e,C){g(C,!0);let w=d(()=>C.data.full),T=d(()=>o(w).windowPolicy),E=d(()=>o(w).fullPolicy),D=d(()=>o(T).maturityGraceMonths??0),O=d(()=>o(w).codeRevision?.split(`+`).filter(Boolean).map(e=>e.slice(0,7))??[]),k=d(()=>b(o(w).story.referenceCost)),oe=[{title:`Space science & the space economy`,authors:`Fiore, F., & Elvis, M.`,year:2026,publication:`Space Policy, 75, 101713`,href:`https://doi.org/10.1016/j.spacepol.2025.101713`},{title:`A Measure of Total Research Impact Independent of Time and Discipline`,authors:`Pepe, A., & Kurtz, M. J.`,year:2012,publication:`PLOS ONE, 7(11), e46428`,href:`https://doi.org/10.1371/journal.pone.0046428`},{title:`Assessing your Observatory’s Impact: Best Practices in Establishing and Maintaining Observatory Bibliographies`,authors:`D’Abrusco, R., et al.`,year:2024,publication:`The Open Journal of Astrophysics, 7`,href:`https://doi.org/10.33232/001c.124452`},{title:`Computing and Using Metrics in the ADS`,authors:`Henneken, E. A., et al.`,year:2014,publication:`arXiv:1406.4542`,href:`https://arxiv.org/abs/1406.4542`},{title:`Lessons from a High-Impact Observatory: The Hubble Space Telescope’s Science Productivity between 1998 and 2008`,authors:`Apai, D., et al.`,year:2010,publication:`Publications of the Astronomical Society of the Pacific, 122(893), 808–826`,href:`https://doi.org/10.1086/654851`},{title:`On the calculation of percentile-based bibliometric indicators`,authors:`Waltman, L., & Schreiber, M.`,year:2013,publication:`Journal of the American Society for Information Science and Technology, 64(2), 372–379`,href:`https://doi.org/10.1002/asi.22775`},{title:`ESA Science Programme Missions: Contributions and Exploitation — ESA Mission Publications`,authors:`De Marchi, G., & Parmar, A. N.`,year:2024,publication:`arXiv:2402.12818`,href:`https://arxiv.org/abs/2402.12818`},{title:`Bibliometrics: The Leiden Manifesto for research metrics`,authors:`Hicks, D., Wouters, P., Waltman, L., de Rijcke, S., & Rafols, I.`,year:2015,publication:`Nature, 520, 429–431`,href:`https://doi.org/10.1038/520429a`}];var A=ae(),se=h(A);ne(se,{title:`Methods`,description:`How we select NASA science missions, find tracked publications, compare citations, and account for mission cost and time.`});var ce=l(se,2),le=a(ce);{let e=d(()=>`Data as of ${v(o(w).asOf)}.`);re(le,{name:`Methods`,get second(){return o(e)},children:(e,t)=>{u();var n=s(`How we compare mission costs with tracked publications and citations.`);c(e,n)},$$slots:{default:!0}})}var j=l(le,2),M=l(a(j),2),N=l(a(M),2),P=l(a(N)),ue=i(P,!0),de=l(P);p(N),u(2),p(M);var F=l(M,2),I=l(a(F),2),fe=l(a(I));p(I),u(12),p(F);var L=l(F,2),R=l(a(L),4),pe=l(a(R));p(R),u(10),p(L);var z=l(L,2),B=l(a(z),4),me=i(B,!0),V=l(B,2),H=a(V),he=l(H),ge=e=>{var n=s();r(e=>t(n,`; a cut window shorter than
				${e??``} years is not scored`),[()=>S(o(E).minWindowYears)]),c(e,n)};n(he,e=>{o(E).minWindowYears&&e(ge)}),u(),p(V);var U=l(V,2),_e=i(U,!0),ve=l(U,2),ye=i(ve);u(4),p(z);var W=l(z,2),G=l(a(W),2),be=l(a(G)),xe=i(be);u(3),p(G);var Se=l(G,2),Ce=i(Se);p(W);var K=l(W,2),we=l(a(K),2),Te=i(we);u(2),p(K);var q=l(K,2),J=l(a(q),6),Ee=l(a(J));p(J),p(q);var Y=l(q,2),X=l(a(Y),4),Z=l(a(X)),De=i(Z,!0),Oe=l(Z),ke=l(Oe),Ae=e=>{var n=s();r(e=>t(n,`;
					the analysis was run from a working tree of the science-mission-citations analysis code with uncommitted changes relative to
					${o(O).length>1?`revisions`:`revision`} ${e??``}`),[()=>y(o(O))]),c(e,n)},je=e=>{var n=s();r(e=>t(n,`;
				science-mission-citations analysis code ${o(O).length>1?`revisions`:`revision`} ${e??``}`),[()=>y(o(O))]),c(e,n)};n(ke,e=>{o(O).length&&o(w).codeRevisionDirty?e(Ae):o(O).length&&e(je,1)}),u(),p(X);var Q=l(X,2),Me=a(Q),Ne=l(Me);u(3),p(Q),p(Y);var $=l(Y,2),Pe=l(a($),2),Fe=l(a(Pe));m(Fe,`href`,`mailto:casey.dreier@planetary.org`),Fe.textContent=`casey.dreier@planetary.org`,u(),p(Pe),p($);var Ie=l($,4),Le=l(a(Ie),2);_(Le,21,()=>oe,e=>e.href,(e,n)=>{var s=ie(),d=a(s),f=i(d,!0),h=l(d,2),g=a(h),_=l(g),v=i(_,!0);u(),p(h),p(s),r(()=>{m(d,`href`,o(n).href),t(f,o(n).title),t(g,`${o(n).authors??``} (${o(n).year??``}). `),t(v,o(n).publication)}),c(e,s)}),p(Le),p(Ie),p(j),p(ce),r((e,n,r,i,a,s,c,l,u,d,f,p,h,g,_,v)=>{t(ue,e),t(de,` projects primarily built and funded by
				NASA’s science programs, launched from
				${o(w).launchYears[0]??``} to ${o(w).launchYears[1]??``}, spanning ${n??``} divisions.
				It focuses on US-led, free-flying missions with mature publication windows. The default
				comparison allows papers the publication year and ${r??``} following
				calendar years to accrue citations. Hosted instruments are excluded; failed missions remain
				in the study.`),t(fe,` They are not necessarily its full publication record. The snapshot contains
				${i??``} distinct tracked publications across the study.`),t(pe,` are highly cited relative to tracked papers published around the same time
				in the same division. We group publication years into bands targeting at least
				${a??``} papers, then identify the top decile within each band. This reduces
				age effects without removing every difference in citation opportunity.`),t(me,te),t(H,`The default comparison covers publications from a mission’s operating life and allows
				${s??``} years after mission end for results to appear. Each paper’s
				citations count from its publication year through the ${c??``} calendar
				years that follow. A window counts as mature ${l??``} months before its last citation year
				ends, so the most recent papers’ final citation year is counted only through the as-of date (at
				least ${u??``} of its twelve months), and their counts can still grow slightly. A
				mission still operating, or one that ended too recently, is cut at the latest window end that is
				mature on the as-of date`),t(_e,d),t(ye,`This comparison follows the prime phase, with ${f??``} years after prime mission
				end for results to appear. Its length varies by mission.`),t(xe,`${o(w).costBaseYear??``} dollars`),t(Ce,`Cost comparisons use individual mission values. The ${p??``} line is
				a discussion point in adjusted dollars, not a scientific boundary. A mission exactly on the
				line belongs to the “at or below” group.`),t(Te,`Each mission carries the outcome recorded in the mission catalog. Three outcomes count as
				falling short: ${h??``}. The shortfall rate on each side of the
				${o(k)??``} line is the share of costed missions with one of them, overall and in each division.`),t(Ee,` The two-group comparison counts each mission’s
				top-10% papers, averages them per mission on each side of the ${o(k)??``} line within each
				division, and then averages the divisions with equal weight. The same comparison is also shown
				division by division.`),t(De,g),t(Oe,`. Records were fetched between
				${_??``} and ${v??``}`),t(Me,`${o(w).attribution.acknowledgement??``} See the `),m(Ne,`href`,o(w).attribution.adsTermsUrl)},[()=>x(o(w).missions),()=>S(o(w).divisions.length),()=>S(o(E).citationYears),()=>x(o(w).papersDistinct),()=>x(o(w).yearCohortMinN),()=>S(o(E).postEndYears),()=>S(o(E).citationYears),()=>S(o(D)),()=>S(12-o(D)),()=>ee(o(T)),()=>S(o(T).postPrimeYears),()=>b(o(w).story.referenceCost),()=>y(o(w).story.failure.statuses),()=>v(o(w).asOf),()=>v(o(w).fetchedMin),()=>v(o(w).fetchedMax)]),c(e,A),f()}export{C as component};