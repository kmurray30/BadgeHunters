import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Search the Activate scores page for a player name.
 * playactivate.com is likely a JS-rendered SPA, so plain HTTP fetch
 * may not return useful HTML. We log extensively for debugging.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_mode")?.value !== "active") {
    return NextResponse.json({ error: "Admin mode not active" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [], debug: "Query too short" });
  }

  const trimmedQuery = query.trim();
  const debugLog: string[] = [];
  debugLog.push(`[search-activate] Searching for: "${trimmedQuery}"`);

  try {
    const targetUrl = `https://playactivate.com/scores?search=${encodeURIComponent(trimmedQuery)}`;
    debugLog.push(`[search-activate] Fetching: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    debugLog.push(`[search-activate] Response status: ${response.status}`);
    debugLog.push(`[search-activate] Content-Type: ${response.headers.get("content-type")}`);

    if (!response.ok) {
      debugLog.push(`[search-activate] Non-OK response, returning empty`);
      console.log(debugLog.join("\n"));
      return NextResponse.json({ results: [], debug: debugLog });
    }

    const html = await response.text();
    debugLog.push(`[search-activate] Response body length: ${html.length} chars`);

    // Log a snippet of what we got to understand the page structure
    const bodySnippet = html.slice(0, 500);
    debugLog.push(`[search-activate] First 500 chars: ${bodySnippet}`);

    // Broad regex approach: look for anything resembling the query in text content
    const allTextContent: string[] = [];
    const textRegex = />([^<]{2,50})</g;
    let regexMatch;
    while ((regexMatch = textRegex.exec(html)) !== null) {
      const text = regexMatch[1].trim();
      if (text.toLowerCase().includes(trimmedQuery.toLowerCase())) {
        allTextContent.push(text);
      }
    }

    debugLog.push(`[search-activate] Text matches containing query: ${allTextContent.length}`);
    if (allTextContent.length > 0) {
      debugLog.push(`[search-activate] Matches: ${JSON.stringify(allTextContent.slice(0, 10))}`);
    }

    // Also try to find JSON data embedded in the page (common with SPAs)
    const jsonDataMatches = html.match(/"(?:name|player|username|displayName)":\s*"([^"]+)"/gi) || [];
    const jsonNames = jsonDataMatches
      .map((match) => {
        const nameMatch = match.match(/":\s*"([^"]+)"$/);
        return nameMatch ? nameMatch[1] : null;
      })
      .filter((name): name is string =>
        name !== null && name.toLowerCase().includes(trimmedQuery.toLowerCase())
      );
    debugLog.push(`[search-activate] JSON-embedded name matches: ${jsonNames.length}`);

    const uniqueResults = [...new Set([...allTextContent, ...jsonNames])].slice(0, 10);

    console.log(debugLog.join("\n"));
    return NextResponse.json({ results: uniqueResults, debug: debugLog });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debugLog.push(`[search-activate] Error: ${errorMessage}`);
    console.log(debugLog.join("\n"));
    return NextResponse.json({ results: [], debug: debugLog });
  }
}
