// Supabase Edge Function: 生成 COS 预签名 URL
// 密钥只存在于服务端，前端拿到签名URL后直传COS
// 支持：上传预签名URL、删除签名、观看签名URL

import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const COS_SECRET_ID  = Deno.env.get("COS_SECRET_ID")!;
const COS_SECRET_KEY = Deno.env.get("COS_SECRET_KEY")!;
const BUCKET  = "review-videos-1438185079";
const REGION   = "ap-beijing";
const HOST     = `${BUCKET}.cos.${REGION}.myqcloud.com`;

// ── COS 签名（COS v5 签名算法）──────────────────────────────────────────────
// 文档：https://cloud.tencent.com/document/product/436/7778
function cosAuth(method: string, key: string, expireSeconds = 600) {
  const now   = Math.floor(Date.now() / 1000);
  const exp   = now + expireSeconds;
  const tk    = `${now};${exp}`;                       // q-sign-time / q-key-time

  // SignKey = HMAC-SHA1(SecretKey, KeyTime)
  const signKey = createHmac("sha1", COS_SECRET_KEY)
    .update(tk).digest("hex");

  // HttpString
  const uriPath = "/" + key;                            // 注意：key 不含前导 "/"
  const httpString = [
    method.toLowerCase(),
    uriPath,
    "",                                                // UrlParamList（空）
    `host=${HOST}`,                                    // HttpHeaders（只签 host）
    "",                                                // 末尾换行
  ].join("\n");

  // StringToSign = SHA1(HttpString) 再用 SignKey 做一次 HMAC
  const sha1Http = createHmac("sha1", signKey)
    .update(httpString).digest("hex");
  const stringToSign = [
    "sha1",
    tk,
    sha1Http,
    "",
  ].join("\n");

  // Signature = HMAC-SHA1(SignKey, StringToSign)
  const signature = createHmac("sha1", signKey)
    .update(stringToSign).digest("hex");

  // 组装 Authorization
  return [
    "q-sign-algorithm=sha1",
    `q-ak=${COS_SECRET_ID}`,
    `q-sign-time=${tk}`,
    `q-key-time=${tk}`,
    "q-header-list=host",
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
}

// ── CORS ─────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body  = await req.json().catch(() => ({}));
    const { key, action } = body;

    if (!key) {
      return new Response(JSON.stringify({ error: "缺少 key" }), {
        status:  400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 删除签名 ───────────────────────────────────────────────────────────
    if (action === "delete") {
      const auth = cosAuth("delete", key, 600);
      return new Response(
        JSON.stringify({ auth, method: "DELETE" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 观看签名 URL（默认 24 h）────────────────────────────────────────
    if (action === "view") {
      const auth = cosAuth("get", key, 86400);
      const url  = `https://${HOST}/${encodeURIComponent(key)}?${auth}`;
      return new Response(
        JSON.stringify({ url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 默认：返回上传预签名 URL（10 min 有效）─────────────────────────
    // 前端拿到 URL 后 PUT 直传
    const auth     = cosAuth("put", key, 600);
    const uploadUrl = `https://${HOST}/${encodeURIComponent(key)}`;
    return new Response(
      JSON.stringify({ uploadUrl, auth, method: "PUT" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status:  500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
