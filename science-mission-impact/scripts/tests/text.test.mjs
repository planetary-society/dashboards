import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { cleanTitle } from '../lib/text.mjs';

describe('cleanTitle', () => {
	it('turns the ADS markup in real titles into plain text', () => {
		const cases = [
			['H<SUB>2</SUB>SO<SUB>4</SUB>', 'H₂SO₄'],
			['<SUP>44</SUP>Ti', '⁴⁴Ti'],
			['O<sup>+</sup> outflow', 'O⁺ outflow'],
			// A script with a character Unicode lacks keeps its TeX spelling, never runs into its base;
			// symbols written on the line anyway (☉, *, ±, °, the point in 2.5) need no form.
			['θ<SUB>E</SUB> and M<SUB>⊙</SUB>', 'θ_{E} and M⊙'],
			['at 20R<SUB>S</SUB> in Saturn\'s magnetosphere', 'at 20R_{S} in Saturn\'s magnetosphere'],
			['PM<SUB>2.5</SUB> and K<SUP>±</SUP>', 'PM₂.₅ and K±'],
			// A group split across the tag is the tag's own.
			['z = 1.8<SUP>{+0.4</SUP>}<SUB>{-0.3</SUB>} for', 'z = 1.8⁺⁰.⁴₋₀.₃ for'],
			['between <SUP>{13</SUP>}CO J = 2-1', 'between ¹³CO J = 2-1'],
			['$^{13}$CO and <SUP>20</SUP>Ne', '¹³CO and ²⁰Ne'],
			['the $t_{Burst}$ of GRBs', 'the t_{Burst} of GRBs'],
			// TeX internals with a character-code argument go, argument and all; a bare script takes its word.
			['fAPAR<inline-formula><tex-math>{}_non\\mathchar \'\'702D chl</tex-math></inline-formula>)', 'fAPARₙₒₙ chl)'],
			['a $\\char\'55$ b and $H_\\infty$', 'a b and H_{∞}'],
			// An accent keeps its base; the space inside the wrapper is layout.
			['SQuIGG<inline-formula> <mml:math><mml:mover><mml:mrow><mml:mi>L</mml:mi></mml:mrow><mml:mrow><mml:mo>→</mml:mo></mml:mrow></mml:mover></mml:math> </inline-formula>E: Buried', 'SQuIGGLE: Buried'],
			// The degree sign, however it is written.
			['at 90 km, 70<inline-formula><mml:math><mml:msup><mml:mi></mml:mi><mml:mo>∘</mml:mo></mml:msup></mml:math></inline-formula> N', 'at 90 km, 70° N'],
			['from Small (6<SUP>∘</SUP>) to Large', 'from Small (6°) to Large'],
			['binary LS I +61∘303 at $30^\\circ$ or 5\\degree', 'binary LS I +61°303 at 30° or 5°'],
			// Braces left over from TeX go; old ADS capitals and delimited scripts are read.
			['{DELTA}T/T and the value of {OMEGA}_0_.', 'ΔT/T and the value of Ω₀.'],
			['the positive latitude e{<SUP>-</SUP>}e{<SUP>+</SUP>} feature}', 'the positive latitude e⁻e⁺ feature'],
			['Catalogue of {&gt;} 55 MeV events at {≈} 1 AU', 'Catalogue of > 55 MeV events at ≈ 1 AU'],
			['z &lt; 0.4', 'z < 0.4'],
			['Integration &amp;amp; Test', 'Integration & Test'],
			['Ny-&amp;Aring;lesund &#39;x&#x27;', "Ny-Ålesund 'x'"],
			['CO<inline-formula><mml:math><mml:msub><mml:mi></mml:mi><mml:mn>2</mml:mn></mml:msub></mml:math></inline-formula>', 'CO₂'],
			['<inline-formula><mml:math><mml:mrow><mml:msub><mml:mtext>NO</mml:mtext><mml:mi>x</mml:mi></mml:msub></mml:mrow></mml:math></inline-formula> over China', 'NOₓ over China'],
			['Land <inline-formula><tex-math>CO_{2}</tex-math></inline-formula> Exchange', 'Land CO₂ Exchange'],
			['solar wind $\\epsilon$ as seen', 'solar wind ε as seen'],
			['PSR B1509$-$58', 'PSR B1509-58'],
			['high-resolution &lt;?xmltex \\hack{ }?&gt;(3 h, 10 km)', 'high-resolution (3 h, 10 km)'],
			['&lt;sl&gt;Chandra&lt;/sl&gt; and RXTE', 'Chandra and RXTE'],
			['<ASTROBJ>AD Leonis</ASTROBJ>: Flares', 'AD Leonis: Flares'],
			['productivity&lt;!- Characterization of soil -&gt;', 'productivity'],
			['{\\text{O}}_{\\text{2}} fluxes', 'O₂ fluxes'],
			['time dilation\\? Use of In\\ Situ data', 'time dilation? Use of In Situ data'],
			['  two   spaces\n', 'two spaces']
		];
		for (const [raw, clean] of cases) assert.equal(cleanTitle(raw), clean, raw);
	});

	it('leaves real comparisons, prices and plain text alone', () => {
		assert.equal(cleanTitle('Galaxies at 0.2<Z<1.1 and 2 < z < 3'), 'Galaxies at 0.2<Z<1.1 and 2 < z < 3');
		assert.equal(cleanTitle('272 pp., $190 (hardback)'), '272 pp., $190 (hardback)');
		assert.equal(cleanTitle('Plain title'), 'Plain title');
		assert.equal(cleanTitle(null), null);
	});
});
