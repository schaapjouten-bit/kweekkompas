const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app-v132.js'), 'utf8');

function sourceBetween(startMarker, endMarker) {
    const start = appSource.indexOf(startMarker);
    const bodyStart = appSource.indexOf('\n', start) + 1;
    const end = appSource.indexOf(endMarker, bodyStart);
    return appSource.slice(bodyStart, end);
}

function createControlledDatabase() {
    const operations = [];
    const database = {
        objectStoreNames: { contains: () => true },
        transaction() {
            const transaction = {
                error: null,
                oncomplete: null,
                onerror: null,
                onabort: null,
                objectStore() {
                    return {
                        put() {
                            const request = { result: 'stored-key', error: null, onsuccess: null, onerror: null };
                            operations.push({ transaction, request, kind: 'put' });
                            return request;
                        },
                        delete() {
                            const request = { result: undefined, error: null, onsuccess: null, onerror: null };
                            operations.push({ transaction, request, kind: 'delete' });
                            return request;
                        }
                    };
                },
                abort() {
                    transaction.onabort?.({ target: transaction });
                }
            };
            return transaction;
        }
    };
    return { database, operations };
}

async function loadDatabaseHooks(database) {
    const context = {
        indexedDB: {
            open() {
                const request = {};
                queueMicrotask(() => request.onsuccess?.({ target: { result: database } }));
                return request;
            }
        },
        console: { warn: () => {} }
    };
    const source = sourceBetween('// --- INDEXED DB WRAPPER ---', '// --- SAFE DYNAMIC CONTENT ---');
    vm.runInNewContext(`${source}\nglobalThis.__hooks = { initDB, saveSeed, deleteSeedDB };`, context);
    await context.__hooks.initDB();
    return context.__hooks;
}

async function waitForOperation(operations) {
    await Promise.resolve();
    assert.equal(operations.length, 1);
    return operations[0];
}

test('opslaan en verwijderen voltooien pas bij transaction.oncomplete', async () => {
    const { database, operations } = createControlledDatabase();
    const { saveSeed, deleteSeedDB } = await loadDatabaseHooks(database);

    const savePromise = saveSeed({ id: 'seed-1', naam: 'Tomaat' });
    const saveOperation = await waitForOperation(operations);
    let saveSettled = false;
    savePromise.then(() => { saveSettled = true; });
    saveOperation.request.onsuccess({ target: saveOperation.request });
    await Promise.resolve();
    assert.equal(saveSettled, false);
    saveOperation.transaction.oncomplete();
    await savePromise;

    operations.length = 0;
    const deletePromise = deleteSeedDB('seed-1');
    const deleteOperation = await waitForOperation(operations);
    let deleteSettled = false;
    deletePromise.then(() => { deleteSettled = true; });
    deleteOperation.request.onsuccess({ target: deleteOperation.request });
    await Promise.resolve();
    assert.equal(deleteSettled, false);
    deleteOperation.transaction.oncomplete();
    await deletePromise;
});

test('requestsucces gevolgd door transaction-abort wordt afgewezen', async () => {
    for (const method of ['saveSeed', 'deleteSeedDB']) {
        const { database, operations } = createControlledDatabase();
        const hooks = await loadDatabaseHooks(database);
        const promise = method === 'saveSeed'
            ? hooks.saveSeed({ id: 'seed-1', naam: 'Tomaat' })
            : hooks.deleteSeedDB('seed-1');
        const operation = await waitForOperation(operations);

        operation.request.onsuccess({ target: operation.request });
        operation.transaction.error = new Error('transaction aborted');
        operation.transaction.onabort({ target: operation.transaction });

        await assert.rejects(promise, /transaction aborted/);
    }
});

test('transactiefout wordt afgewezen voor opslaan en verwijderen', async () => {
    for (const method of ['saveSeed', 'deleteSeedDB']) {
        const { database, operations } = createControlledDatabase();
        const hooks = await loadDatabaseHooks(database);
        const promise = method === 'saveSeed'
            ? hooks.saveSeed({ id: 'seed-1', naam: 'Tomaat' })
            : hooks.deleteSeedDB('seed-1');
        const operation = await waitForOperation(operations);

        operation.transaction.error = new Error('transaction failed');
        operation.transaction.onerror({ target: operation.transaction });

        await assert.rejects(promise, /transaction failed/);
    }
});

test('synchrone transactiefouten worden afgewezen', async () => {
    const database = {
        objectStoreNames: { contains: () => true },
        transaction() {
            throw new Error('transaction unavailable');
        }
    };
    const { saveSeed, deleteSeedDB } = await loadDatabaseHooks(database);

    await assert.rejects(saveSeed({ id: 'seed-1', naam: 'Tomaat' }), /transaction unavailable/);
    await assert.rejects(deleteSeedDB('seed-1'), /transaction unavailable/);
});
