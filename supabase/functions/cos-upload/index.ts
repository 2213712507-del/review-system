// Supabase Edge Function: 生成 COS 预签名 URL（纯 v5 签名算法）
// 严格按照腾讯云文档实现：https://cloud.tencent.com/document/product/436/7778

import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const COS_SECRET_ID  = Deno.env.get("COS_SECRET_ID")!;
const COS_SECRET_KEY = Deno.env.get("COS_SECRET_KEY")!;
const BUCKET  = "review-videos-1438185079";
const REGION   = "ap-beijing";
const HOST     = `${BUCKET}.cos.${REGION}.myqcloud.com`;

// HMAC-SHA1 → hex
function hmacSha1(key: string, data: string): string {
  return createHmac("sha1", key).update(data).digest("hex");
}

// SHA1 → hex
function sha1Hex(data: string): string {
  return createHmac("sha1", "").update(data).digest("hex");
}

// ── COS v5 Authorization 签名 ────────────────────────────────────────────────
function cosSign(method: string, pathname: string, headers: Record<string, string>): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 600; // 10 分钟有效期
  const keyTime = `${now};${exp}`;

  // 1. SignKey = HMAC-SHA1(SecretKey, KeyTime)
  const signKey = hmacSha1(COS_SECRET_KEY, keyTime);

  // 2. 处理 HttpHeaders → FormatHeaders
  // key 和 value 都 URL 编码，key 转小写
  const headerKeys = Object.keys(headers).sort();
  const headerList = headerKeys.join(";").toLowerCase();
  const formatHeaders = headerKeys
    .map(k => {
      const keyEnc = encodeURIComponent(k).toLowerCase();
      const valEnc = encodeURIComponent(headers[k]).toLowerCase();
      return `${keyEnc}=${valEnc}`;
    })
    .join("&");

  // 3. HttpString
  // 格式: HttpMethod\nUriPathname\nHttpParameters\nHttpHeaders\n
  const uri = pathname.startsWith("/") ? pathname : "/" + pathname;
  const httpMethod = method.toLowerCase();
  const httpParameters = "";  // 空
  const httpHeaders = formatHeaders;
  const httpString = `${httpMethod}\n${uri}\n${httpParameters}\n${httpHeaders}\n`;

  // 4. StringToSign
  // 格式: sha1\nKeyTime\nSHA1(HttpString)\n
  const sha1OfHttp = sha1Hex(httpString);
  const stringToSign = `sha1\n${keyTime}\n${sha1OfHttp}\n`;

  // 5. Signature = HMAC-SHA1(SignKey, StringToSign)
  const signature = hmacSha1(signKey, stringToSign);

  // 6. 组装 Authorization
  return [
    "q-sign-algorithm=sha1",
    `q-ak=${COS_SECRET_ID}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    "q-url-param-list=",
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
      const auth = cosSign("delete", key, { host: HOST });
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
      // view 用 GET 签名，24h 有效期
      const auth = cosSign("get", key, { host: HOST });
      const url = `https://${HOST}/${encodeURIComponent(key)}?${auth}`;
      return new Response(
        JSON.stringify({ url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 上传：返回 PUT 预签名 URL ──────────────────────────────────────
    const auth = cosSign("put", key, { host: HOST });
    const uploadUrl = `https://${HOST}/${encodeURIComponent(key)}`;
    return new Response(
      JSON.stringify({ uploadUrl, auth, method: "PUT" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
