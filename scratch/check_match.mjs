import fs from 'fs';

const content = fs.readFileSync('sitac_collo_data.js', 'utf8');

// search for CYBERINDO and INDOMARCO close to each other
let idx = 0;
while (true) {
    let p = content.indexOf('CYBERINDO', idx);
    if (p === -1) break;
    let snippet = content.substring(Math.max(0, p - 100), Math.min(content.length, p + 200));
    if (snippet.includes('INDOMARCO')) {
        console.log('MATCH in sitac_collo_data.js at', p, snippet);
    }
    idx = p + 1;
}
