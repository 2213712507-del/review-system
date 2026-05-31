// Supabase Edge Function: COS 操作代理
// 前端把文件发给 Edge Function，Edge Function 用密钥直接上传到 COS
// 密钥永不离开服务端

const COS_SECRET_ID = Deno.env.get("COS_SECRET_ID")!;
const COS_SECRET_KEY = Deno.env.get("COS_SECRET_KEY")!;
const BUCKET = "review-videos-1438185079";
const REGION = "ap-beijing";
const HOST = `${BUCKET}.cos.${REGION}.myqcloud.com`;

import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

// 生成 COS 签名（Authorization header 格式）
function cosSign(method: string, key: string, contentType: string = ""): string {
  const now = Math.floor(Date.now() / 1000);
  const expire = now + 600;
  const keyTime = `${now};${expire}`;

  const signKey = createHmac("sha1", COS_SECRET_KEY).update(keyTime).digest("hex");

  // HttpHeaders
  const headers: Record<string, string> = { host: HOST };
  if (contentType) headers["content-type"] = contentType;

  const headerKeys = Object.keys(headers).sort();
  const headerList = headerKeys.join(";");
  const httpHeaders = headerKeys
    .map(k => `${k}=${encodeURIComponent(headers[k])}`)
    .join("&");

  // HttpString
  const uriPathname = "/" + key;
  const httpParameters = "";
  const httpString = `${method.toLowerCase()}\n${uriPathname}\n${httpParameters}\n${httpHeaders}\n`;

  // StringToSign
  const sha1HttpString = createHmac("sha1", signKey).update(httpString).digest("hex");
  const stringToSign = `sha1\n${keyTime}\n${sha1HttpString}\n`;

  // Signature
  const signature = createHmac("sha1", signKey).update(stringToSign).digest("hex");

  return [
    `q-sign-algorithm=sha1`,
    `q-ak=${COS_SECRET_ID}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    `q-url-param-list=`,
    `q-signature=${signature}`,
  ].join("&");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { key, action } = body;

    if (!key) {
      return new Response(JSON.stringify({ error: "缺少 key" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const auth = cosSign("DELETE", key);
      const res = await fetch(`https://${HOST}/${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: { Authorization: auth },
      });
      return new Response(
        JSON.stringify({ success: res.ok }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "view") {
      const auth = cosSign("GET", key);
      const url = `https://${HOST}/${encodeURIComponent(key)}?${auth}`;
      return new Response(
        JSON.stringify({ url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 上传：前端发 base64 文件内容，Edge Function 直接 PUT 到 COS
    const { fileBase64, contentType } = body;
    if (!fileBase64 || !contentType) {
      return new Response(JSON.stringify({ error: "缺少 fileBase64 或 contentType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileData = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
    const auth = cosSign("PUT", key, contentType);

    const res = await fetch(`https://${HOST}/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {
        Authorization: auth,
        "Content-Type": contentType,
        "Content-Length": String(fileData.length),
      },
      body: fileData,
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `COS上传失败: ${res.status} ${text}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        publicUrl: `https://${HOST}/${key}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
