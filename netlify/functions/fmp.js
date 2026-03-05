exports.handler = async function (event) {
  const path = event.queryStringParameters && event.queryStringParameters.path;
  if (!path) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing path parameter' }) };
  }

  const apiKey = process.env.FMP_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'FMP_KEY environment variable not set' }) };
  }

  const separator = path.includes('?') ? '&' : '?';
  const url = 'https://financialmodelingprep.com/api/v3' + path + separator + 'apikey=' + apiKey;

  try {
    const response = await fetch(url);
    const body = await response.text();
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: body,
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Upstream request failed: ' + err.message }) };
  }
};
