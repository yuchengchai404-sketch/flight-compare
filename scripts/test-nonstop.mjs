import assert from 'node:assert/strict';
import '../browser-helper/nonstop-core.js';
const only=globalThis.flightNonstop.only;
for(const s of ['直飞 ¥2000','直达 ¥2000','nonstop CNY 2000','0 stops CNY 2000'])assert.equal(only(s),true);
for(const s of ['¥2000','直飞 中转','经停 1 次','1 stop','直飞 经停','直飞 转机'])assert.equal(only(s),false);
assert.equal(only('直飞 ¥3000','roundtrip'),false);assert.equal(only('直飞 直飞 ¥3000','roundtrip'),true);assert.equal(only('直飞 中转 ¥3000','roundtrip'),false);
console.log('PASS nonstop capture: explicit positive evidence, transfers and unknown excluded, both RT legs required');
