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

      // Check safeguard: must keep at least 2
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

      const { error: insertError } = await serviceClient
        .from("internal_staff_users")
        .insert({ user_id: targetUser.id, email, role_id: roleId, invited_by: user.id });

      if (insertError) {
        if (insertError.code === "23505") throw new Error("Cet utilisateur est déjà membre du staff");
        throw insertError;
      }

      await serviceClient.from("audit_logs").insert({
        user_id: user.id,
        action: "add_staff",
        module: "staff",
        after_data: { email, role_id: roleId, target_user_id: targetUser.id },
      });

      return new Response(JSON.stringify({ success: true }), {
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

      // Delete existing and re-insert
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
        .select("id, country, plan, subscription_status, created_at");

      const { data: tenantUsers } = await serviceClient
        .from("tenant_users")
        .select("id");

      const { data: subs } = await serviceClient
        .from("stripe_subscriptions")
        .select("customer_id, status, price_id")
        .eq("status", "active");

      const allTenants = tenants || [];
      const activeTenants = allTenants.filter((t: Record<string, unknown>) => t.subscription_status === "active");
      const trialingTenants = allTenants.filter((t: Record<string, unknown>) => t.subscription_status === "trialing");

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

      // MRR from Stripe subscriptions (simplified — would need price lookup in production)
      const mrr = (subs || []).length * 19; // placeholder base

      return new Response(JSON.stringify({
        totalTenants: allTenants.length,
        activeTenants: activeTenants.length,
        trialingTenants: trialingTenants.length,
        totalUsers: (tenantUsers || []).length,
        byCountry: Object.entries(countryMap).map(([country, count]) => ({ country, count })),
        byPlan: Object.entries(planMap).map(([plan, count]) => ({ plan, count })),
        mrr,
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
        .select("id, email, staff_code, role:internal_staff_roles(name)")
        .eq("is_active", true);

      const { data: tenants } = await serviceClient
        .from("tenants")
        .select("id, referred_by_staff_code, subscription_status, created_at, plan");

      const { data: subs } = await serviceClient
        .from("stripe_subscriptions")
        .select("customer_id, status")
        .eq("status", "active");

      const { data: stripeCustomers } = await serviceClient
        .from("stripe_customers")
        .select("user_id, customer_id");

      // Build user_id -> tenant map
      const { data: tenantUsers } = await serviceClient
        .from("tenant_users")
        .select("tenant_id, user_id, is_owner");

      const userToTenant: Record<string, string> = {};
      (tenantUsers || []).forEach((tu: Record<string, unknown>) => {
        if (tu.is_owner) userToTenant[tu.user_id as string] = tu.tenant_id as string;
      });

      // customer_id -> user_id
      const customerToUser: Record<string, string> = {};
      (stripeCustomers || []).forEach((sc: Record<string, unknown>) => {
        customerToUser[sc.customer_id as string] = sc.user_id as string;
      });

      // user_id -> has active sub
      const usersWithActiveSub = new Set<string>();
      (subs || []).forEach((s: Record<string, unknown>) => {
        const uid = customerToUser[s.customer_id as string];
        if (uid) usersWithActiveSub.add(uid);
      });

      const performance = (staffUsers || []).map((staff: Record<string, unknown>) => {
        const code = staff.staff_code as string;
        const roleData = staff.role as unknown as { name: string } | null;

        if (!code) {
          return {
            staff_code: code || '',
            email: staff.email,
            role_name: roleData?.name || '',
            tenants_count: 0,
            paid_count: 0,
            conversion_rate: 0,
            revenue: 0,
          };
        }

        const referredTenants = (tenants || []).filter((t: Record<string, unknown>) =>
          t.referred_by_staff_code === code &&
          new Date(t.created_at as string) >= new Date(since)
        );

        const paidCount = referredTenants.filter((t: Record<string, unknown>) =>
          t.subscription_status === 'active'
        ).length;

        // Revenue: count active subs for tenants referred by this staff
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
        };
      });

      // Sort by revenue descending (leaderboard)
      performance.sort((a, b) => b.revenue - a.revenue);

      return new Response(JSON.stringify({ performance }), {
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

      // Get user emails
      const userIds = [...new Set((invoices || []).map((inv: Record<string, unknown>) => inv.created_by).filter(Boolean))];
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
