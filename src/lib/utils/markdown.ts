// Tiny markdown → HTML for interview answers.
// Supports only what the answers use: paragraphs (blank line), **bold**, `code`,
// "- " bullet lists and "1. " numbered lists. Input is HTML-escaped first,
// so the output is safe to render with {@html}.

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s: string): string {
	return s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+\.\s+(.*)$/;

export function markdownToHtml(md: string): string {
	const blocks = escapeHtml(md.replace(/\r\n/g, '\n').trim()).split(/\n\s*\n/);
	const out: string[] = [];

	for (const block of blocks) {
		const lines = block.split('\n');
		let para: string[] = [];
		let list: { type: 'ul' | 'ol'; items: string[] } | null = null;

		const flushPara = () => {
			if (para.length) out.push(`<p>${inline(para.join('<br>'))}</p>`);
			para = [];
		};
		const flushList = () => {
			if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
			list = null;
		};

		for (const line of lines) {
			const b = line.match(BULLET);
			const n = line.match(NUMBERED);
			const type = b ? 'ul' : n ? 'ol' : null;
			if (type) {
				flushPara();
				if (list && list.type !== type) flushList();
				list ??= { type, items: [] };
				list.items.push((b ?? n)![1]);
			} else if (list && /^\s+\S/.test(line)) {
				list.items[list.items.length - 1] += ' ' + line.trim(); // continuation of a list item
			} else {
				flushList();
				if (line.trim()) para.push(line.trim());
			}
		}
		flushList();
		flushPara();
	}
	return out.join('');
}
