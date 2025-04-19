// functions/_middleware.js - Cloudflare Pages Middleware

import { sha256 } from '../js/sha256.js';

export async function onRequest(context) {
  const { request, env, next } = context;

  const response = await next();

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") || response.status !== 200) {
    return response;
  }

  try {
    let html = await response.text();
    const password = env.PASSWORD || "";
    let passwordHash = "";

    if (password) {
      passwordHash = await sha256(password);
      console.log("Injecting hashed password into HTML response.");
    } else {
      console.log("No password set; injecting empty string.");
    }

    const placeholder = 'window.__ENV__.PASSWORD = "{{PASSWORD}}";';
    const replacement = `window.__ENV__.PASSWORD = "${passwordHash}"; /* SHA-256 hash injected by middleware */`;

    if (html.includes(placeholder)) {
      html = html.replace(placeholder, replacement);
      console.log("Password placeholder replaced in HTML.");
    } else {
      console.warn("Password placeholder not found in HTML, skipping injection.");
    }

    const newHeaders = new Headers(response.headers);

    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    console.error("Error injecting password hash:", error);
    return response;
  }
}
