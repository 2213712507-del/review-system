// Supabase Edge Function: COS 操作代理
// 用服务端密钥生成预签名 URL，密钥永不离开服务端

import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const SECRET_ID = Deno.env.get("COS_SECRET_ID")!;
const SECRET_KEY = Deno.env.get("COS_SECRET_KEY")!;
const BUCKET = "review-videos-1438185079";
const REGION = "ap-beijing";
const HOST = `${BUCKET}.cos.${REGION}.myqcloud.com`;

// 生成 COS 签名
function sign(method: string, key: string, expireSeconds = 600): string {
  const now = Math.floor(Date.now() / 1000);
  const expire = now + expireSeconds;
  const keyTime = `${now};${expire}`;

  const signKey = createHmac("sha1", SECRET_KEY).update(keyTime).digest("hex");

  const uriPathname = "/" + key;
  const httpString = `${method.toLowerCase()}\n${uriPathname}\n\nhost=${HOST}\n`;

  const sha1HttpString = createHmac("sha1", signKey).update(httpString).digest("hex");
  const stringToSign = `sha1\n${keyTime}\n${sha1HttpString}\n`;

  const signature = createHmac("sha1", signKey).update(stringToSign).digest("hex");

  return [
    `q-sign-algorithm=sha1`,
    `q-ak=${SECRET_ID}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=host`,
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
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "未登录" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { key, contentType, action } = body;

    if (!key) {
      return new Response(JSON.stringify({ error: "缺少 key" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const deleteUrl = `https://${HOST}/${encodeURIComponent(key)}`;
      const authorization = sign("DELETE", key);
      return new Response(
        JSON.stringify({ deleteUrl, authorization }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "view") {
      // 生成预签名观看 URL（24小时有效）
      const authorization = sign("GET", key, 86400);
      const viewUrl = `https://${HOST}/${encodeURIComponent(key)}?${authorization}`;
      return new Response(
        JSON.stringify({ url: viewUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 上传操作
    if (!contentType) {
      return new Response(JSON.stringify({ error: "缺少 contentType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authorization = sign("PUT", key);
    const uploadUrl = `https://${HOST}/${encodeURIComponent(key)}`;

    return new Response(
      JSON.stringify({
        uploadUrl,
        authorization,
        publicUrl: `https://${HOST}/${key}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
