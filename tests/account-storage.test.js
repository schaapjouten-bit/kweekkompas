const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../account-storage.js'), 'utf8');
function fixture() {
    const map = new Map();
    const localStorage = { get length() { return map.size; }, key: i => [...map.keys()][i] ?? null, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(String(k), String(v)), removeItem: k => map.delete(k) };
    const context = { localStorage, crypto: { randomUUID: () => 'signal' } };
    vm.runInNewContext(source, context);
    return { localStorage, scope: context.KweekAccountStorage };
}
const admin = { id: '11111111-1111-4111-8111-111111111111', role: 'admin' };
const user = { id: '22222222-2222-4222-8222-222222222222', role: 'user' };
test('unclaimed legacy garden stays hidden after a regular account signs out', () => {
    const f = fixture(); f.localStorage.setItem('garden', 'legacy');
    assert.equal(f.scope.create(null).storage.getItem('garden'), 'legacy');
    assert.equal(f.scope.create(user).storage.getItem('garden'), null);
    assert.equal(f.scope.create(null).storage.getItem('garden'), null);
    assert.equal(f.scope.create(admin).storage.getItem('garden'), 'legacy');
});
test('binding admin preserves legacy state and pauses the old sync queue', () => {
    const f = fixture(); const key = 'kweekkompas_auto_' + admin.id;
    f.localStorage.setItem('garden', 'legacy');
    f.localStorage.setItem(key, JSON.stringify({ enabled: true, counter: 9, done: 8 }));
    const a = f.scope.create(admin);
    assert.equal(a.database('MoestuinDB'), 'MoestuinDB');
    const queue = JSON.parse(f.localStorage.getItem(key));
    assert.equal(queue.enabled, false); assert.equal(queue.paused, 'choose'); assert.equal(queue.counter, 9);
    const b = f.scope.create(user); b.storage.setItem('garden', 'user');
    assert.equal(a.storage.getItem('garden'), 'legacy');
    b.storage.clear(); assert.equal(a.storage.getItem('garden'), 'legacy');
    assert.equal(f.scope.create(admin).storage.getItem('garden'), 'legacy');
});
