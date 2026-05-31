// Supabase Edge Function: 生成 COS 预签名 URL
// 密钥只存在于服务端，前端拿到签名URL后直传COS
// 支持：上传预签名URL、删除签名、观看签名URL

import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const COS_SECRET_ID  = Deno.env.get("COS_SECRET_ID")!;
const COS_SECRET_KEY = Deno.env.get("COS_SECRET_KEY")!;
const BUCKET  = "review-videos-1438185079";
const REGION   = "ap-beijing";
const HOST     = `${BUCKET}.cos.${REGION}.myqcloud.com`;

// ── COS v5 签名 ──────────────────────────────────────────────────────────────
function sha1Hmac(key: string, data: string): string {
  return createHmac("sha1", key).update(data).digest("hex");
}

function cosAuth(
  method: string,
  pathname: string,
  headers: Record<string, string>,
  params: Record<string, string>,
  expireSeconds = 600,
): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expireSeconds;
  const keyTime = `${now};${exp}`;

  // SignKey
  const signKey = sha1Hmac(COS_SECRET_KEY, keyTime);

  // FormatHeaders
  const headerKeys = Object.keys(headers).sort();
  const headerList = headerKeys.join(";").toLowerCase();
  const formatHeaders = headerKeys
    .map((k) => `${k.toLowerCase()}=${encodeURIComponent(headers[k]).toLowerCase()}`)
    .join("&");

  // FormatParameters
  const paramKeys = Object.keys(params).sort();
  const paramList = paramKeys.join(";").toLowerCase();
  const formatParameters = paramKeys
    .map((k) => `${k.toLowerCase()}=${encodeURIComponent(params[k])}`)
    .join("&");

  // HttpString
  const httpString = [
    method.toLowerCase(),
    pathname.startsWith("/") ? pathname : "/" + pathname,
    formatParameters,
    formatHeaders,
    "",
  ].join("\n");

  // StringToSign
  const sha1Http = sha1Hmac(signKey, httpString);
  const stringToSign = ["sha1", keyTime, sha1Http, ""].join("\n");

  // Signature
  const signature = sha1Hmac(signKey, stringToSign);

  return [
    "q-sign-algorithm=sha1",
    `q-ak=${COS_SECRET_ID}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    `q-url-param-list=${paramList}`,
    `q-signature=${signature}`,
  ].join("&");
}

// ── CORS ─────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { key, action } = body;

    if (!key) {
      return new Response(JSON.stringify({ error: "缺少 key" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = { host: HOST };

    // ── 删除 ───────────────────────────────────────────────────────────
    if (action === "delete") {
      const auth = cosAuth("delete", key, headers, {}, 600);
      const res = await fetch(`https://${HOST}/${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: { Authorization: auth },
      });
      return new Response(
        JSON.stringify({ success: res.ok }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 观看 ───────────────────────────────────────────────────────────
    if (action === "view") {
      const auth = cosAuth("get", key, headers, {}, 86400);
      const url = `https://${HOST}/${encodeURIComponent(key)}?${auth}`;
      return new Response(
        JSON.stringify({ url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 上传：返回预签名 URL ───────────────────────────────────────────
    const auth = cosAuth("put", key, headers, {}, 600);
    const uploadUrl = `https://${HOST}/${encodeURIComponent(key)}`;
    return new Response(
      JSON.stringify({ uploadUrl, auth, method: "PUT" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
