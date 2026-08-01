import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if caller is super admin
    const { data: saCheck } = await supabase
      .from("super_admins")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!saCheck) {
      return new Response(JSON.stringify({ error: "Forbidden — super admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";
    const body = await req.json().catch(() => ({}));

    // ---- ADD SUPER ADMIN ----
    if (action === "add-super-admin") {
      const { email } = body;
      if (!email) throw new Error("Email required");

      const { data: users, error: listError } = await serviceClient.auth.admin.listUsers();
      if (listError) throw listError;

      const targetUser = users.users.find((u) => u.email === email);
      if (!targetUser) throw new Error("Utilisateur introuvable — l'utilisateur doit d'abord créer un compte");

      const { error: insertError } = await serviceClient
        .from("super_admins")
        .insert({ user_id: targetUser.id, email, added_by: user.id });

      if (insertError) {
        if (insertError.code === "23505") throw new Error("Cet utilisateur est déjà super admin");
        throw insertError;
      }

      await serviceClient.from("audit_logs").insert({
        user_id: user.id,
        action: "grant_super_admin",
        module: "super_admin",
        after_data: { email, target_user_id: targetUser.id },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- DELETE SUPER ADMIN ----
    if (action === "delete-super-admin") {
      const { adminId } = body;
      if (!adminId) throw new Error("adminId required");

      const { count } = await serviceClient
        .from("super_admins")
        .select("*", { count: "exact", head: true });

      if (count !== null && count <= 2) {
        throw new Error("Impossible de supprimer : au moins 2 Super Admin doivent rester actifs à tout moment");
      }

      const { data: saRecord } = await serviceClient
        .from("super_admins")
        .select("email, user_id")
        .eq("id", adminId)
        .maybeSingle();

      const { error: deleteError } = await serviceClient
        .from("super_admins")
        .delete()
        .eq("id", adminId);

      if (deleteError) throw deleteError;

      await serviceClient.from("audit_logs").insert({
        user_id: user.id,
        action: "revoke_super_admin",
        module: "super_admin",
        before_data: saRecord ? { email: saRecord.email, user_id: saRecord.user_id } : null,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- ADD STAFF USER ----
    if (action === "add-staff") {
      const { email, roleId } = body;
      if (!email || !roleId) throw new Error("Email and roleId required");

      const { data: users, error: listError } = await serviceClient.auth.admin.listUsers();
      if (listError) throw listError;

      const targetUser = users.users.find((u) => u.email === email);
      if (!targetUser) throw new Error("Utilisateur introuvable — l'utilisateur doit d'abord créer un compte");

      const { data: roleData } = await serviceClient
        .from("internal_staff_roles")
        .select("name")
        .eq("id", roleId)
        .maybeSingle();

      const { data: inserted, error: insertError } = await serviceClient
        .from("internal_staff_users")
        .insert({ user_id: targetUser.id, email, role_id: roleId, invited_by: user.id })
        .select("id, staff_code")
        .single();

      if (insertError) {
        if (insertError.code === "23505") throw new Error("Cet utilisateur est déjà membre du staff");
        throw insertError;
      }

      // Log code assignment
      if (inserted.staff_code) {
        await serviceClient.from("commercial_code_assignments").insert({
          staff_user_id: inserted.id,
          staff_code: inserted.staff_code,
          assigned_by: user.id,
          action: "generated",
          notes: `Auto-generated for ${roleData?.name || 'staff'} role`,
        });
      }

      await serviceClient.from("audit_logs").insert({
        user_id: user.id,
        action: "add_staff",
        module: "staff",
        after_data: { email, role_id: roleId, target_user_id: targetUser.id, staff_code: inserted?.staff_code },
      });

      return new Response(JSON.stringify({ success: true, staff_code: inserted?.staff_code }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- DELETE STAFF USER ----
    if (action === "delete-staff") {
      const { staffId } = body;
      if (!staffId) throw new Error("staffId required");

      const { data: staffRecord } = await serviceClient
        .from("internal_staff_users")
        .select("email, user_id, staff_code")
        .eq("id", staffId)
        .maybeSingle();

      const { error: deleteError } = await serviceClient
        .from("internal_staff_users")
        .delete()
        .eq("id", staffId);

      if (deleteError) throw deleteError;

      await serviceClient.from("audit_logs").insert({
        user_id: user.id,
        action: "remove_staff",
        module: "staff",
        before_data: staffRecord,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- TOGGLE STAFF ACTIVE ----
    if (action === "toggle-staff") {
      const { staffId, isActive } = body;
      if (!staffId) throw new Error("staffId required");

      const { error: updateError } = await serviceClient
        .from("internal_staff_users")
        .update({ is_active: isActive })
        .eq("id", staffId);

      if (updateError) throw updateError;

      await serviceClient.from("audit_logs").insert({
        user_id: user.id,
        action: isActive ? "activate_staff" : "deactivate_staff",
        module: "staff",
        after_data: { staff_id: staffId, is_active: isActive },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- UPDATE TENANT PLAN (manual override by a super admin) ----
    if (action === "update-tenant-plan") {
      const { tenantId, plan } = body;
      if (!tenantId || !plan) throw new Error("tenantId and plan required");
      if (!["starter", "pro", "premium", "enterprise"].includes(plan)) throw new Error("Invalid plan");

      const { error: updateError } = await serviceClient.from("tenants").update({ plan }).eq("id", tenantId);
      if (updateError) throw updateError;

      await serviceClient.from("audit_logs").insert({
        user_id: user.id,
        tenant_id: tenantId,
        action: "manual_plan_change",
        module: "tenants",
        after_data: { plan },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- SUSPEND / REACTIVATE A TENANT ----
    if (action === "toggle-tenant-status") {
      const { tenantId, suspend } = body;
      if (!tenantId) throw new Error("tenantId required");

      const { error: updateError } = await serviceClient
        .from("tenants")
        .update({ subscription_status: suspend ? "canceled" : "active" })
        .eq("id", tenantId);
      if (updateError) throw updateError;

      await serviceClient.from("audit_logs").insert({
        user_id: user.id,
        tenant_id: tenantId,
        action: suspend ? "suspend_tenant" : "reactivate_tenant",
        module: "tenants",
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- ADD STAFF ROLE ----
    if (action === "add-role") {
      const { name } = body;
      if (!name) throw new Error("Role name required");

      const { data: role, error: insertError } = await serviceClient
        .from("internal_staff_roles")
        .insert({ name })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === "23505") throw new Error("Ce rôle existe déjà");
        throw insertError;
      }

      await serviceClient.from("audit_logs").insert({
        user_id: user.id,
        action: "create_staff_role",
        module: "staff",
        after_data: { name, role_id: role.id },
      });

      return new Response(JSON.stringify({ success: true, role }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- UPDATE ROLE PERMISSIONS ----
    if (action === "update-permissions") {
      const { roleId, permissions } = body;
      if (!roleId || !Array.isArray(permissions)) throw new Error("roleId and permissions array required");

      await serviceClient
        .from("internal_staff_role_permissions")
        .delete()
        .eq("role_id", roleId);

      if (permissions.length > 0) {
        const { error: permError } = await serviceClient
          .from("internal_staff_role_permissions")
          .insert(permissions.map((p: Record<string, unknown>) => ({
            role_id: roleId,
            module: p.module,
            can_view: !!p.can_view,
            can_create: !!p.can_create,
            can_edit: !!p.can_edit,
            can_delete: !!p.can_delete,
          })));

        if (permError) throw permError;
      }

      await serviceClient.from("audit_logs").insert({
        user_id: user.id,
        action: "update_staff_permissions",
        module: "staff",
        after_data: { role_id: roleId, permissions },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- PLATFORM STATS ----
    if (action === "platform-stats") {
      const { data: tenants } = await serviceClient
        .from("tenants")
        .select("id, country, plan, subscription_status, created_at, referred_by_staff_code");

      const { data: tenantUsers } = await serviceClient
        .from("tenant_users")
        .select("id");

      const allTenants = tenants || [];
      const activeTenants = allTenants.filter((t: Record<string, unknown>) => t.subscription_status === "active");
      const trialingTenants = allTenants.filter((t: Record<string, unknown>) => t.subscription_status === "trialing");
      const churnedTenants = allTenants.filter((t: Record<string, unknown>) => ["canceled", "read_only"].includes(t.subscription_status as string));

      // By country
      const countryMap: Record<string, number> = {};
      allTenants.forEach((t: Record<string, unknown>) => {
        const c = t.country as string;
        countryMap[c] = (countryMap[c] || 0) + 1;
      });

      // By plan
      const planMap: Record<string, number> = {};
      allTenants.forEach((t: Record<string, unknown>) => {
        const p = t.plan as string;
        planMap[p] = (planMap[p] || 0) + 1;
      });

      // Revenue by plan
      const planPrices: Record<string, number> = { enterprise: 189, premium: 69, pro: 19, starter: 9 };
      const revenueByPlan: Record<string, number> = {};
      activeTenants.forEach((t: Record<string, unknown>) => {
        const p = t.plan as string;
        revenueByPlan[p] = (revenueByPlan[p] || 0) + (planPrices[p] || 0);
      });

      // MRR
      const mrr = Object.values(revenueByPlan).reduce((s, v) => s + v, 0);

      // Referral stats
      const referredTenants = allTenants.filter((t: Record<string, unknown>) => t.referred_by_staff_code);
      const referralConversion = referredTenants.filter((t: Record<string, unknown>) => t.subscription_status === "active").length;

      // Churn rate
      const churnRate = allTenants.length > 0
        ? Math.round((churnedTenants.length / allTenants.length) * 100 * 100) / 100
        : 0;

      return new Response(JSON.stringify({
        totalTenants: allTenants.length,
        activeTenants: activeTenants.length,
        trialingTenants: trialingTenants.length,
        churnedTenants: churnedTenants.length,
        totalUsers: (tenantUsers || []).length,
        byCountry: Object.entries(countryMap).map(([country, count]) => ({ country, count })),
        byPlan: Object.entries(planMap).map(([plan, count]) => ({ plan, count })),
        revenueByPlan: Object.entries(revenueByPlan).map(([plan, revenue]) => ({ plan, revenue })),
        mrr,
        referralCount: referredTenants.length,
        referralConversion,
        churnRate,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- STAFF PERFORMANCE ----
    if (action === "staff-performance") {
      const { period } = body;
      const periodDays = period === 'year' ? 365 : period === 'quarter' ? 90 : 30;
      const since = new Date(Date.now() - periodDays * 86400000).toISOString();

      const { data: staffUsers } = await serviceClient
        .from("internal_staff_users")
        .select("id, email, staff_code, role:internal_staff_roles(name), total_referrals, total_conversions, total_revenue_usd, last_activity_at, is_active")
        .eq("is_active", true);

      const { data: tenants } = await serviceClient
        .from("tenants")
        .select("id, referred_by_staff_code, subscription_status, created_at, plan, name, country");

      const performance = (staffUsers || []).map((staff: Record<string, unknown>) => {
        const code = staff.staff_code as string;
        const roleData = staff.role as unknown as { name: string } | null;

        if (!code) {
          return {
            staff_code: '',
            email: staff.email,
            role_name: roleData?.name || '',
            tenants_count: 0,
            paid_count: 0,
            conversion_rate: 0,
            revenue: 0,
            last_activity: staff.last_activity_at,
          };
        }

        const referredTenants = (tenants || []).filter((t: Record<string, unknown>) =>
          t.referred_by_staff_code === code &&
          new Date(t.created_at as string) >= new Date(since)
        );

        const paidCount = referredTenants.filter((t: Record<string, unknown>) =>
          t.subscription_status === 'active'
        ).length;

        let revenue = 0;
        referredTenants.forEach((t: Record<string, unknown>) => {
          if (t.subscription_status === 'active') {
            const plan = t.plan as string;
            revenue += plan === 'enterprise' ? 189 : plan === 'premium' ? 69 : plan === 'pro' ? 19 : 9;
          }
        });

        return {
          staff_code: code,
          email: staff.email,
          role_name: roleData?.name || '',
          tenants_count: referredTenants.length,
          paid_count: paidCount,
          conversion_rate: referredTenants.length > 0 ? (paidCount / referredTenants.length) * 100 : 0,
          revenue,
          total_referrals: staff.total_referrals,
          total_conversions: staff.total_conversions,
          total_revenue_usd: staff.total_revenue_usd,
          last_activity: staff.last_activity_at,
        };
      });

      performance.sort((a, b) => b.revenue - a.revenue);

      return new Response(JSON.stringify({ performance }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- COMMERCIAL TRACKING: Referral events timeline ----
    if (action === "referral-events") {
      const { staffCode, limit } = body;
      const maxLimit = Math.min(limit || 50, 200);

      let query = serviceClient
        .from("commercial_referral_events")
        .select("*, tenants!commercial_referral_events_tenant_id_fkey(name, plan, subscription_status)")
        .order("created_at", { ascending: false })
        .limit(maxLimit);

      if (staffCode) {
        query = query.eq("staff_code", staffCode);
      }

      const { data: events, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ events: events || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- COMMERCIAL TRACKING: Conversion funnel ----
    if (action === "conversion-funnel") {
      const { days } = body;
      const pDays = days || 90;

      const { data, error } = await serviceClient.rpc("get_conversion_funnel", { p_days: pDays });
      if (error) throw error;

      return new Response(JSON.stringify({ funnel: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- COMMERCIAL TRACKING: Churn rate ----
    if (action === "churn-rate") {
      const { days } = body;
      const pDays = days || 90;

      const { data, error } = await serviceClient.rpc("get_churn_rate", { p_days: pDays });
      if (error) throw error;

      return new Response(JSON.stringify({ churnRate: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- COMMERCIAL TRACKING: Referred tenants list ----
    if (action === "referred-tenants") {
      const { staffCode } = body;

      let query = serviceClient
        .from("tenants")
        .select("id, name, country, plan, subscription_status, created_at, referred_by_staff_code, trial_ends_at")
        .not("referred_by_staff_code", "is", null)
        .order("created_at", { ascending: false });

      if (staffCode) {
        query = query.eq("referred_by_staff_code", staffCode);
      }

      const { data: referred, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ tenants: referred || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- COMMERCIAL TRACKING: Code assignment history ----
    if (action === "code-assignments") {
      const { data: assignments, error } = await serviceClient
        .from("commercial_code_assignments")
        .select("*, staff:internal_staff_users(email, staff_code)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      return new Response(JSON.stringify({ assignments: assignments || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- COMMERCIAL TRACKING: Generate manual code ----
    if (action === "generate-code") {
      const { staffUserId } = body;
      if (!staffUserId) throw new Error("staffUserId required");

      const { data: staff } = await serviceClient
        .from("internal_staff_users")
        .select("id, email, staff_code, role:internal_staff_roles(name)")
        .eq("id", staffUserId)
        .maybeSingle();

      if (!staff) throw new Error("Membre du staff introuvable");

      // Generate new code using the DB function
      const { data: newCode, error: codeError } = await serviceClient.rpc("generate_staff_code");
      if (codeError) throw codeError;

      // Update staff user with new code
      const { error: updateError } = await serviceClient
        .from("internal_staff_users")
        .update({ staff_code: newCode })
        .eq("id", staffUserId);

      if (updateError) throw updateError;

      // Log assignment
      await serviceClient.from("commercial_code_assignments").insert({
        staff_user_id: staffUserId,
        staff_code: newCode,
        assigned_by: user.id,
        action: "generated",
        notes: `Manual generation for ${staff.email}`,
      });

      await serviceClient.from("audit_logs").insert({
        user_id: user.id,
        action: "generate_commercial_code",
        module: "commercial",
        after_data: { staff_user_id: staffUserId, staff_code: newCode, email: staff.email },
      });

      return new Response(JSON.stringify({ success: true, staff_code: newCode }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- TEAM PERFORMANCE (tenant) ----
    if (action === "team-performance") {
      const { tenantId, period } = body;
      if (!tenantId) throw new Error("tenantId required");

      const periodDays = period === 'year' ? 365 : period === 'quarter' ? 90 : 30;
      const since = new Date(Date.now() - periodDays * 86400000).toISOString().split('T')[0];

      const { data: invoices } = await serviceClient
        .from("sales_invoices")
        .select("id, total, status, created_by, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", since);

      const { data: users } = await serviceClient.auth.admin.listUsers();
      const userEmailMap: Record<string, string> = {};
      (users?.users || []).forEach((u: { id: string; email?: string }) => {
        userEmailMap[u.id] = u.email || '';
      });

      const memberMap: Record<string, { user_id: string; email: string; invoice_count: number; total_revenue: number }> = {};
      (invoices || []).forEach((inv: Record<string, unknown>) => {
        const uid = inv.created_by as string;
        if (!uid) return;
        if (!memberMap[uid]) {
          memberMap[uid] = { user_id: uid, email: userEmailMap[uid] || 'Utilisateur', invoice_count: 0, total_revenue: 0 };
        }
        memberMap[uid].invoice_count += 1;
        if (inv.status === 'paid') {
          memberMap[uid].total_revenue += inv.total as number;
        }
      });

      const result = Object.values(memberMap).sort((a, b) => b.total_revenue - a.total_revenue);

      return new Response(JSON.stringify({ team: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action: " + action);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
