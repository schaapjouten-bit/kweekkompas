const test=require('node:test');
const assert=require('node:assert/strict');
const {callAI}=require('../netlify/functions/_shared/lib/ai');
test('Google API_KEY_INVALID wordt gelezen en veilig uitgelegd zonder ruwe foutinhoud',async()=>{
 const savedFetch=global.fetch;const savedKey=process.env.GEMINI_API_KEY;
 process.env.GEMINI_API_KEY='private-test-value';
 global.fetch=async()=>new Response(JSON.stringify({error:{code:400,status:'INVALID_ARGUMENT',message:'private-test-value',details:[{reason:'API_KEY_INVALID'}]}}),{status:400});
 try{
  await assert.rejects(()=>callAI({ai:{provider:'gemini',model:'test-model'}},'test','test'),error=>{
    assert.match(error.message,/API_KEY_INVALID/);assert.match(error.message,/backend/);assert(!error.message.includes('private-test-value'));return true;
  });
 }finally{global.fetch=savedFetch;if(savedKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=savedKey;}
});
