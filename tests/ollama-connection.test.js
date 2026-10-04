const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/_shared/ai-config');
test('Ollama connection uses only backend tags and separates installed from configured models', async () => {
    const names = ['KWEEK_LOCAL_DEV','OLLAMA_BASE_URL','OLLAMA_MODEL','OLLAMA_MODELS'];
    const before = names.map(name=>[name,process.env[name]]), original = global.fetch, calls = [];
    Object.assign(process.env,{KWEEK_LOCAL_DEV:'true',OLLAMA_BASE_URL:'http://127.0.0.1:11434',OLLAMA_MODEL:'custom:latest',OLLAMA_MODELS:'not-installed:latest'});
    let state = 'ready';
    global.fetch = async (url,options) => {
        calls.push({url,method:options.method||'GET',body:options.body});
        if(state==='offline') throw Error('connection refused');
        return Response.json({models:state==='empty'?[]:[{name:'llama3:latest'},{name:'custom:latest'}]});
    };
    try {
        let result = JSON.parse((await handler({httpMethod:'GET'})).body);
        assert.equal(result.providers.ollama.label,'Lokale AI (Ollama)');
        assert.deepEqual(result.providers.ollama.connection.installedModels,['llama3:latest','custom:latest']);
        assert(result.providers.ollama.models.includes('not-installed:latest'));
        assert.equal(result.providers.ollama.model,'custom:latest');
        state='empty'; result=JSON.parse((await handler({httpMethod:'GET'})).body); assert.equal(result.providers.ollama.connection.state,'reachable'); assert.deepEqual(result.providers.ollama.connection.installedModels,[]);
        state='offline'; result=JSON.parse((await handler({httpMethod:'GET'})).body); assert.equal(result.providers.ollama.connection.state,'unreachable');
        process.env.OLLAMA_BASE_URL='http://unsafe.example.test'; result=JSON.parse((await handler({httpMethod:'GET'})).body); assert.equal(result.providers.ollama.connection.state,'invalid-config');
        delete process.env.OLLAMA_BASE_URL; delete process.env.OLLAMA_MODEL; delete process.env.OLLAMA_MODELS; delete process.env.KWEEK_LOCAL_DEV;
        result=JSON.parse((await handler({httpMethod:'GET'})).body); assert.equal(result.providers.ollama.connection.runtime,'hosted'); assert.equal(result.providers.ollama.connection.state,'unconfigured'); assert.equal(result.providers.ollama.model,'llama3:latest');
        assert.equal(calls.length,3); assert(calls.every(call=>call.url==='http://127.0.0.1:11434/api/tags' && call.method==='GET' && !call.body));
    } finally { global.fetch=original; before.forEach(([name,value])=>{if(value===undefined)delete process.env[name];else process.env[name]=value;}); }
});
