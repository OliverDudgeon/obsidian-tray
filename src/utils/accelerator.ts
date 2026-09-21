/**
 * Converts a keyboard event into an Electron accelerator string.
 * Neither Obsidian's API nor Electron exposes a hotkey recorder, so we map
 * `KeyboardEvent.code` (layout-independent) onto accelerator key names.
 * https://www.electronjs.org/docs/latest/api/accelerator
 */

const NAMED_KEYS: Record<string, string> = {
	Space: "Space",
	Tab: "Tab",
	Enter: "Return",
	NumpadEnter: "Return",
	Escape: "Esc",
	Backspace: "Backspace",
	Delete: "Delete",
	Insert: "Insert",
	Home: "Home",
	End: "End",
	PageUp: "PageUp",
	PageDown: "PageDown",
	ArrowUp: "Up",
	ArrowDown: "Down",
	ArrowLeft: "Left",
	ArrowRight: "Right",
	PrintScreen: "PrintScreen",
	Minus: "-",
	Equal: "=",
	BracketLeft: "[",
	BracketRight: "]",
	Backslash: "\\",
	Semicolon: ";",
	Quote: "'",
	Comma: ",",
	Period: ".",
	Slash: "/",
	Backquote: "`",
	NumpadAdd: "numadd",
	NumpadSubtract: "numsub",
	NumpadMultiply: "nummult",
	NumpadDivide: "numdiv",
	NumpadDecimal: "numdec",
};

const keyFromCode = (code: string): string | null => {
	const letter = /^Key([A-Z])$/.exec(code);
	if (letter) return letter[1];
	const digit = /^Digit(\d)$/.exec(code);
	if (digit) return digit[1];
	const numpad = /^Numpad(\d)$/.exec(code);
	if (numpad) return `num${numpad[1]}`;
	if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
	return NAMED_KEYS[code] ?? null;
};

interface AcceleratorEvent {
	code: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}

/**
 * Returns the accelerator for a keydown event, or null while only modifiers
 * are held down (i.e. the combination isn't complete yet).
 */
export const acceleratorFromEvent = (event: AcceleratorEvent): string | null => {
	const key = keyFromCode(event.code);
	if (!key) return null;

	const parts: string[] = [];
	if (event.ctrlKey) parts.push("Ctrl");
	// "Meta" is Cmd on macOS and the Windows/Super key elsewhere.
	if (event.metaKey) parts.push("Meta");
	if (event.altKey) parts.push("Alt");
	if (event.shiftKey) parts.push("Shift");
	parts.push(key);
	return parts.join("+");
};
