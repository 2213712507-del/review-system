// Supabase Edge Function: COS 预签名 URL
// 使用腾讯云 COS 官方签名算法，通过 REST API 验证

import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const COS_SECRET_ID  = Deno.env.get("COS_SECRET_ID")!;
const COS_SECRET_KEY = Deno.env.get("COS_SECRET_KEY")!;
const BUCKET  = "review-videos-1438185079";
const REGION   = "ap-beijing";
const HOST     = `${BUCKET}.cos.${REGION}.myqcloud.com`;

// ── 辅助函数 ─────────────────────────────────────────────────────────────────
function hmac(key: string, msg: string): string {
  return createHmac("sha1", key).update(msg).digest("hex");
}

function sha1(msg: string): string {
  return createHmac("sha1", "").update(msg).digest("hex");
}

// ── COS v5 签名 ──────────────────────────────────────────────────────────────
// 严格按 https://cloud.tencent.com/document/product/436/7778
function cosAuth(
  method: string,
  pathname: string,
  query: Record<string, string> = {},
  headers: Record<string, string> = {},
  expire = 600,
): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expire;
  const keyTime = `${now};${exp}`;

  // SignKey
  const signKey = hmac(COS_SECRET_KEY, keyTime);

  // HttpParameters
  const paramKeys = Object.keys(query).sort();
  const urlParamList = paramKeys.join(";").toLowerCase();
  const httpParameters = paramKeys
    .map(k => `${encodeURIComponent(k).toLowerCase()}=${encodeURIComponent(query[k])}`)
    .join("&");

  // HttpHeaders
  const headerKeys = Object.keys(headers).sort();
  const headerList = headerKeys.join(";").toLowerCase();
  const httpHeaders = headerKeys
    .map(k => `${encodeURIComponent(k).toLowerCase()}=${encodeURIComponent(headers[k])}`)
    .join("&");

  // HttpString: Method\nPath\nParameters\nHeaders\n
  const path = pathname.startsWith("/") ? pathname : "/" + pathname;
  const httpString = `${method.toLowerCase()}\n${path}\n${httpParameters}\n${httpHeaders}\n`;

  // StringToSign
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;

  // Signature
  const signature = hmac(signKey, stringToSign);

  return [
    "q-sign-algorithm=sha1",
    `q-ak=${COS_SECRET_ID}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    `q-url-param-list=${urlParamList}`,
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

    // ── 删除 ───────────────────────────────────────────────────────────
    if (action === "delete") {
      const auth = cosAuth("delete", key, {}, { host: HOST });
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
      const auth = cosAuth("get", key, {}, { host: HOST }, 86400);
      const url = `https://${HOST}/${encodeURIComponent(key)}?${auth}`;
      return new Response(
        JSON.stringify({ url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 上传：返回预签名 URL ──────────────────────────────────────────
    const auth = cosAuth("put", key, {}, { host: HOST }, 600);
    const uploadUrl = `https://${HOST}/${encodeURIComponent(key)}`;
    return new Response(
      JSON.stringify({ uploadUrl, auth, method: "PUT" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("Edge Function 错误:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
