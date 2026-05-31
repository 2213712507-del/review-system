// Edge Function: 数据库迁移（一次性使用）
// 通过 Supabase Management API 执行 SQL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({}));
  const { sql } = body;

  if (!sql) {
    return new Response(JSON.stringify({ error: "missing sql" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error } = await supabase.rpc("exec_sql", { query: sql }).maybeSingle();

    if (error) {
      // 如果 rpc 不支持，尝试直接通过 REST API
      // 实际 Supabase 没有 exec_sql RPC，需要用 Management API
      const mgmtRes = await fetch(
        `https://api.supabase.com/v1/projects/brqiryhudyopxarhfbgd/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sql }),
        }
      );
      const mgmtData = await mgmtRes.json();
      return new Response(JSON.stringify({ success: true, data: mgmtData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
