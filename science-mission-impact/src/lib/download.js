/** Hand the viewer `text` as a file named `filename`. Browser only: call it from an event handler. */
export function downloadText(text, filename, type = 'text/csv;charset=utf-8') {
	const href = URL.createObjectURL(new Blob([text], { type }));
	const link = document.createElement('a');
	link.href = href;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(href), 0);
}
