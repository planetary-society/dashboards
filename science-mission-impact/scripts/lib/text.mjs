/**
 * ADS titles (and the odd author) arrive with markup: <SUB>/<SUP>, MathML inside
 * <inline-formula>, <tex-math> and $…$ TeX, <?xmltex …?> processing instructions,
 * and entities escaped once or twice. `cleanTitle` turns that into plain text.
 */

const SUB = '0₀1₁2₂3₃4₄5₅6₆7₇8₈9₉+₊-₋−₋=₌(₍)₎a ₐe ₑh ₕi ᵢj ⱼk ₖl ₗm ₘn ₙo ₒp ₚr ᵣs ₛt ₜu ᵤv ᵥx ₓβ ᵦγ ᵧρ ᵨφ ᵩχ ᵪ';
const SUP = '0⁰1¹2²3³4⁴5⁵6⁶7⁷8⁸9⁹+⁺-⁻−⁻=⁼(⁽)⁾a ᵃb ᵇc ᶜd ᵈe ᵉf ᶠg ᵍh ʰi ⁱj ʲk ᵏl ˡm ᵐn ⁿo ᵒp ᵖr ʳs ˢt ᵗu ᵘv ᵛw ʷx ˣy ʸz ᶻ∘ °';
const table = (pairs) => new Map([...pairs.replaceAll(' ', '').matchAll(/(.)(.)/gu)].map(([, a, b]) => [a, b]));
const SUB_MAP = table(SUB);
const SUP_MAP = table(SUP);
// Written on the line either way: M☉, M*, K±, 6°, PM₂.₅, p,i.
const INLINE = new Set([...'☉⊙⊕*∗⋆★†®°′″±∓\'.,']);

/**
 * A script in Unicode when every character has a form (or is written on the line anyway);
 * otherwise the TeX spelling with its braces, `_{BH}`, rather than run into the base.
 */
function script(text, map, mark) {
	const body = text.replace(/[{}]/g, '').trim();
	const chars = [...body];
	if (chars.length === 0) return '';
	return chars.every((c) => map.has(c) || INLINE.has(c)) ? chars.map((c) => map.get(c) ?? c).join('') : `${mark}{${body}}`;
}
const sub = (text) => script(text, SUB_MAP, '_');
const sup = (text) => script(text, SUP_MAP, '^');

// The named entities the titles use (`&_slash;` is an ADS artifact); case matters for Aring.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', plus: '+', Aring: 'Å', _slash: '/' };
/** One pass of entity decoding; `&amp;amp;` needs two. */
const decodeOnce = (s) =>
	s.replace(/&(#x[0-9a-f]+|#\d+|[a-z_]+);/gi, (whole, name) => {
		if (name[0] === '#') return String.fromCodePoint(name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
		return ENTITIES[name] ?? whole;
	});

// ponytail: a few common macros; anything else loses its backslash. Add entries as titles need them.
const MACROS = {
	alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', lambda: 'λ', mu: 'μ', nu: 'ν',
	pi: 'π', sigma: 'σ', tau: 'τ', theta: 'θ', phi: 'φ', omega: 'ω', Delta: 'Δ', Omega: 'Ω',
	sim: '∼', approx: '≈', times: '×', pm: '±', le: '≤', leq: '≤', ge: '≥', geq: '≥', odot: '⊙', oplus: '⊕',
	circ: '°', degree: '°', prime: '′', infty: '∞', star: '⋆'
};
/** A known macro, or the longest known one it starts with (`\muM` is μM); otherwise the bare name. */
function macro(name) {
	if (MACROS[name]) return MACROS[name];
	const prefix = Object.keys(MACROS).filter((k) => name.startsWith(k)).sort((a, b) => b.length - a.length)[0];
	return prefix ? MACROS[prefix] + name.slice(prefix.length) : name;
}
/** Old ADS capitals in braces: {DELTA} is Δ, {OMEGA} is Ω. */
const capital = (whole, name) => MACROS[name[0] + name.slice(1).toLowerCase()] ?? whole;

/** TeX to plain text: the macro table, scripts by `script`, and no $, \ or stray braces. */
function tex(s) {
	let out = s
		// TeX internals with a character-code argument (\mathchar"702D, \char'55): unknown ones go, argument and all.
		.replace(/\\([A-Za-z]+)\s*(?:"[0-9A-Fa-f]+|''[0-9A-Fa-f]+|'[0-7]+)/g, (whole, name) => (MACROS[name] ? whole : ''))
		// Spacing commands (\, \: \; \! and a backslash-space) are a space.
		.replace(/\\[,:;! ]/g, ' ')
		// Font switches keep only their argument.
		.replace(/\\(?:text|mathrm|mathbf|mathit|boldsymbol|rm|bf|it)(?![A-Za-z])\s*/g, '')
		.replace(/\\([A-Za-z]+)/g, (_, name) => macro(name))
		.replace(/\{([A-Z]{2,})\}/g, capital)
		// Old ADS delimited scripts: {OMEGA}_0_ is Ω_{0}.
		.replace(/([_^])([^_^\s{}]+)\1/g, '$1{$2}')
		.replace(/[$\\]/g, '');
	// Unwrap every group that is not a script's argument, innermost first: {{O}}_{{2}} is O_{2}.
	for (let next; (next = out.replace(/(^|[^_^])\{([^{}]*)\}/g, '$1$2')) !== out; ) out = next;
	return out
		// What is left of the braces is a script's argument, or a stray.
		.replace(/[_^]\{[^{}]*\}|[{}]/g, (token) => (token.length > 1 ? token : ''))
		.replace(/\^\{([^{}]*)\}|\^([A-Za-z0-9]+|[^\s_^])/g, (_, group, bare) => sup(group ?? bare))
		.replace(/_\{([^{}]*)\}|_([A-Za-z0-9]+|[^\s_^])/g, (_, group, bare) => sub(group ?? bare));
}

/** MathML: the text of the token elements in document order, msub/msup/msubsup as scripts, an accent's base alone. */
function mathml(s) {
	const root = { name: '', children: [] };
	const stack = [root];
	for (const [, close, name, selfClose, text] of s.matchAll(/<(\/?)([\w:.-]+)[^>]*?(\/?)>|([^<]+)/g)) {
		const top = stack.at(-1);
		if (text !== undefined) top.children.push(text);
		else if (close) { if (stack.length > 1) stack.pop(); }
		else {
			const node = { name: name.replace(/^mml:/, ''), children: [] };
			top.children.push(node);
			if (!selfClose) stack.push(node);
		}
	}
	const render = (node) => {
		if (typeof node === 'string') return node;
		const parts = node.children.filter((c) => typeof c !== 'string' || ['mi', 'mn', 'mo', 'mtext'].includes(node.name)).map(render);
		if (node.name === 'msub') return (parts[0] ?? '') + sub(parts[1] ?? '');
		if (node.name === 'msup') return (parts[0] ?? '') + sup(parts[1] ?? '');
		if (node.name === 'msubsup') return (parts[0] ?? '') + sub(parts[1] ?? '') + sup(parts[2] ?? '');
		if (['mover', 'munder', 'munderover'].includes(node.name)) return parts[0] ?? '';
		return parts.join('');
	};
	return render(root);
}

/** Plain text of an ADS title or author string; null stays null. */
export function cleanTitle(value) {
	if (typeof value !== 'string') return value ?? null;
	let s = value;
	for (let next = decodeOnce(s); next !== s; next = decodeOnce(s)) s = next;
	return s
		.replace(/<\?[\s\S]*?\?>/g, '')
		// Comments, including one cut off at the end of the field.
		.replace(/<!-[\s\S]*?(?:-?->|$)/g, '')
		// Space just inside a formula wrapper is layout, not text: SQuIGG<inline-formula> L⃗ </inline-formula>E.
		.replace(/(<inline-formula\b[^>]*>)\s+|\s+(<\/inline-formula>)/gi, '$1$2')
		.replace(/<mml:math\b[\s\S]*?<\/mml:math>/g, mathml)
		.replace(/<tex-math\b[^>]*>([\s\S]*?)<\/tex-math>/gi, (_, body) => tex(body))
		// A group split across the tag, <SUP>{13</SUP>}, is the tag's own.
		.replace(/<(sub|sup)>\{([^<{}]*)<\/\1>\}/gi, '<$1>$2</$1>')
		.replace(/<(sub|sup)\b[^>]*>([^<]*)<\/\1>/gi, (_, tag, body) => (tag.toLowerCase() === 'sub' ? sub(body) : sup(body)))
		// Paired dollars around TeX-looking content; a lone $ may be a price.
		.replace(/\$([^$]+)\$/g, (whole, body) => (/[\\^_{}]/.test(body) || !/\s/.test(body) ? tex(body) : whole))
		// TeX written without dollars: once a macro, a spacing command or a brace gives it away.
		.replace(/^.*(?:\\[A-Za-z,:;! ]|[{}]).*$/s, tex)
		// Any other backslash escapes punctuation: "\?" is "?".
		.replace(/\\/g, '')
		// Tags only: "<" then a letter or "/", so "0.42 < z < 0.70" survives.
		.replace(/<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/?>/g, '')
		// The ring operator stands in for a degree sign: 26∘ N.
		.replace(/∘/g, '°')
		.replace(/\s+/g, ' ')
		.trim();
}
