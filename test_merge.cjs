const data = require('./events_dump.json');
const extractTextFromEvent = (event) => {
    if (!event || !event.payload) return '';
    const payload = event.payload;
    const msg = payload.message || payload.data || payload.input || payload.prompt || payload.query || payload;

    if (typeof msg === 'string') return msg;
    if (msg && typeof msg === 'object') {
        if (typeof msg.text === 'string') return msg.text;
        if (typeof msg.content === 'string') return msg.content;
        if (Array.isArray(msg.content)) {
            return msg.content.map(c => c.text || c.content || '').join('');
        }
        if (Array.isArray(msg.messages)) {
            return msg.messages.map(m => typeof m === 'string' ? m : (m.text || m.content || '')).join('');
        }
    }
    return '';
};

const merged = [];
for (const e of data.events) {
    const rawText = extractTextFromEvent(e).trim();
    if (!rawText) continue;

    let mergedIntoExisting = false;

    // Look back up to 10 recent messages to find a stream to merge into
    const lookbackLimit = Math.max(0, merged.length - 10);
    for (let j = merged.length - 1; j >= lookbackLimit; j--) {
        const prev = merged[j];

        // Explicit stream ID match or exact duplicate
        const sameId = (prev.eventId && prev.eventId === e.eventId) || (prev.stream && prev.stream === e.stream);

        if (sameId || prev.text === rawText) {
            if (e.kind === 'chat') prev.kind = 'chat'; // Elevate kind
            prev.ts = Math.max(prev.ts, e.ts);
            if (rawText.length > prev.text.length) prev.text = rawText;
            mergedIntoExisting = true;
            break;
        }

        // Incoming is an expansion of previous (cumulative chunk)
        if (rawText.startsWith(prev.text)) {
            prev.text = rawText;
            if (e.kind === 'chat') prev.kind = 'chat';
            prev.ts = Math.max(prev.ts, e.ts);
            mergedIntoExisting = true;
            break;
        }

        // Incoming is a delayed older chunk, ignore it and keep the longer previous chunk
        if (prev.text.startsWith(rawText)) {
            prev.ts = Math.max(prev.ts, e.ts);
            mergedIntoExisting = true;
            break;
        }
    }

    if (!mergedIntoExisting) {
        merged.push({ ...e, text: rawText });
    }
}

console.log('Total merged messages:', merged.length);
console.log('Final text length:', merged[0]?.text.length);
console.log(merged.map(m => m.text.substring(0, 50)));

