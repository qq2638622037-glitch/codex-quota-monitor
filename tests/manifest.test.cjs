const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const mf = JSON.parse(fs.readFileSync(path.join(ROOT,'edge-extension','manifest.json'),'utf8'));
assert.equal(mf.manifest_version,3);
assert.equal(mf.version,'1.6.0');
assert.deepEqual(mf.permissions,['system.memory']);
assert.deepEqual(mf.host_permissions,['https://codex-reset.com/*']);
assert.deepEqual(mf.content_scripts.map(x=>x.matches),[['https://chatgpt.com/*']]);
assert.equal(mf.background.service_worker,'background.js');
for(const filename of ['bridge.js','background.js']) {
  assert(fs.existsSync(path.join(ROOT,'edge-extension',filename)));
}
const script=fs.readFileSync(path.join(ROOT,'userscript','Codex_Quota_Bars_Web_CN_v1.6.user.js'),'utf8');
assert.match(script,/@version\s+1\.6\.0/);
assert.match(script,/@match\s+https:\/\/chatgpt\.com\/\*/);
assert.match(script,/https:\/\/codex-reset\.com\/api\/forecast/);
assert.match(script,/来源 codex-reset\.com/);
assert.match(script,/credentials:'omit'/);
assert.match(script,/referrerPolicy:'no-referrer'/);
console.log('Manifest, limited host permission, source credit, privacy and metadata PASS');
