// netlify/functions/research.js
// This function keeps your Anthropic API key safe on the server side.
// The browser never sees the key.

exports.handler = async function(event) {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured. Add it in Netlify > Site settings > Environment variables." })
    };
  }

  let company;
  try {
    const parsed = JSON.parse(event.body);
    company = parsed.company;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  if (!company || typeof company !== "string" || company.length > 100) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid company name" }) };
  }

  const prompt = `Research the public company "${company}" and provide comprehensive, current data. Return ONLY valid JSON with no markdown, no backticks, no explanation. Use this exact structure:
{
  "companyName": "Full company name",
  "ticker": "TICKER",
  "exchange": "Exchange name",
  "sector": "Sector",
  "industry": "Industry",
  "description": "2-3 sentence company description",
  "hq": "City, State, Country",
  "website": "https://...",
  "ceo": "CEO Name",
  "employees": "number as string",
  "founded": "year",
  "marketCap": "e.g. $3.5T",
  "stockPrice": "current price as number string",
  "priceChange": "daily change as number string like +2.50 or -1.30",
  "priceChangePct": "daily change percent like +0.95 or -0.50",
  "pe": "P/E ratio as number string",
  "range52w": "e.g. 169.21 - 288.62",
  "beta": "beta as number string",
  "volume": "average volume as string",
  "leadership": [{"name": "Name", "title": "Title"}],
  "board": [{"name": "Name", "title": "Title"}],
  "news": [{"title": "Headline", "source": "Source name", "date": "YYYY-MM-DD", "summary": "1-2 sentence summary", "url": "https://..."}],
  "analysts": [{"firm": "Firm name", "rating": "Buy/Sell/Hold/Overweight/etc", "previousRating": "Previous rating or null", "action": "Upgrade/Downgrade/Maintain/Initiate", "date": "YYYY-MM-DD"}],
  "earnings": [{"period": "Q1 2025", "date": "YYYY-MM-DD", "revenue": "number", "netIncome": "number", "eps": "number", "grossProfit": "number"}],
  "earningsSurprise": {"actualEps": "number", "estimatedEps": "number"}
}
Include at least 5 news items, 5 analyst ratings, 4 quarters of earnings, and 6 leadership members. Use the most current data available.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: "You are a financial data research assistant. Always respond with ONLY raw valid JSON. No markdown, no backticks, no explanation text. Just the JSON object.",
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "AI research failed. Status: " + response.status })
      };
    }

    const result = await response.json();

    // Extract text blocks from response
    const textBlocks = (result.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    // Parse JSON from the text
    let parsed = null;
    const cleaned = textBlocks.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const jsonStart = cleaned.search(/\{/);
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    }

    if (!parsed || !parsed.companyName) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Could not parse company data. Try a more specific name or ticker." })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300" // cache for 5 min
      },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Internal error" })
    };
  }
};
