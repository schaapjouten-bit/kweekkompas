export async function adapt(handler, request) {
    const result = await handler({ httpMethod: request.method, headers: Object.fromEntries(request.headers), body: ['GET', 'HEAD'].includes(request.method) ? '' : await request.text() });
    const headers = new Headers(result.headers);
    for (const cookie of result.multiValueHeaders?.['Set-Cookie'] || []) headers.append('Set-Cookie', cookie);
    return new Response(result.body, { status: result.statusCode, headers });
}
