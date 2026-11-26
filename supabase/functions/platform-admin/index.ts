// Supabase Edge Function: platform-admin
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const token = authHeader.replace('Bearer ', '')
    
    // Create service role client for full DB access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify user and role using the provided token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (user.app_metadata?.role !== 'SUPER_ADMIN') {
      return new Response(JSON.stringify({ error: 'Forbidden: SUPER_ADMIN required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    if (action === 'stores_overview') {
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = 20
      const offset = (page - 1) * limit
      const search = url.searchParams.get('search') || ''
      const filter = url.searchParams.get('filter') || 'all' // all, active, risk, inactive

      // 1. Get all stores
      let storesQuery = supabaseAdmin.from('stores').select('id, name, slug, status, expires_at, plan_value, created_at, user_id, whatsapp, custom_domain', { count: 'exact' })

      if (search) {
        storesQuery = storesQuery.ilike('name', `%${search}%`)
      }

      storesQuery = storesQuery.order('created_at', { ascending: false })

      // If no activity filter, paginate in DB
      if (filter === 'all') {
        storesQuery = storesQuery.range(offset, offset + limit - 1)
      }

      const { data: stores, count: totalCount, error: storesErr } = await storesQuery
      if (storesErr) throw storesErr

      // 2. Get all auth users
      const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers()
      if (usersErr) throw usersErr
      const users = usersData.users || []

      // 3. Get product counts per store (single query)
      const { data: allProducts } = await supabaseAdmin.from('products').select('store_id')
      const productCountMap: Record<string, number> = {}
      for (const p of (allProducts || [])) {
        productCountMap[p.store_id] = (productCountMap[p.store_id] || 0) + 1
      }

      // 4. Get order counts per store (single query)
      const { data: allOrders } = await supabaseAdmin.from('orders').select('store_id')
      const orderCountMap: Record<string, number> = {}
      for (const o of (allOrders || [])) {
        orderCountMap[o.store_id] = (orderCountMap[o.store_id] || 0) + 1
      }

      const now = new Date()

      let result = (stores || []).map(store => {
        const user = users.find(u => u.id === store.user_id)

        let responsavel = store.name
        if (user) {
          if (user.user_metadata?.name) responsavel = user.user_metadata.name
          else if (user.email) responsavel = user.email
        }

        let activityStatus = 'inactive'
        let lastLogin = null
        if (user && user.last_sign_in_at) {
          lastLogin = user.last_sign_in_at
          const diffDays = (now.getTime() - new Date(lastLogin).getTime()) / (1000 * 3600 * 24)
          if (diffDays <= 7) activityStatus = 'active'
          else if (diffDays <= 30) activityStatus = 'risk'
        }

        // Subscription status calculation
        let subscriptionStatus = store.status === 'suspended' ? 'blocked' : 'active'
        let expiresInDays: number | null = null
        if (store.expires_at) {
          const expiresAt = new Date(store.expires_at)
          expiresInDays = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 3600 * 24))
          if (store.status === 'suspended') {
            subscriptionStatus = 'blocked'
          } else if (expiresInDays > 7) {
            subscriptionStatus = 'active'
          } else if (expiresInDays > 0) {
            subscriptionStatus = 'expiring'
          } else if (expiresInDays >= -5) {
            subscriptionStatus = 'grace'
          } else {
            subscriptionStatus = 'blocked'
          }
        }

        return {
          id: store.id,
          name: store.name,
          slug: store.slug,
          custom_domain: store.custom_domain,
          status: store.status,
          plan_value: store.plan_value,
          expires_at: store.expires_at,
          expires_in_days: expiresInDays,
          subscription_status: subscriptionStatus,
          products_count: productCountMap[store.id] || 0,
          orders_count: orderCountMap[store.id] || 0,
          created_at: store.created_at,
          responsavel,
          email: user?.email || '',
          telefone: store.whatsapp || '',
          last_login: lastLogin,
          activity_status: activityStatus
        }
      })

      // Apply activity filter client-side if needed
      if (filter !== 'all') {
        result = result.filter(r => r.activity_status === filter)
        result = result.slice(offset, offset + limit)
      }

      return new Response(JSON.stringify({
        success: true,
        data: result,
        count: filter === 'all' ? totalCount : result.length
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'stats') {
      // 1. Get all stores
      const { data: stores, error: storesErr } = await supabaseAdmin.from('stores').select('id, status, expires_at, created_at, user_id')
      if (storesErr) throw storesErr

      // 2. Get all users for last_sign_in_at
      const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers()
      if (usersErr) throw usersErr
      const users = usersData.users || []

      // 3. Match users to stores and calculate active/risk/inactive
      const now = new Date()
      let totalClients = stores.length
      let activeClients = 0
      let riskClients = 0
      let inactiveClients = 0
      
      let clients7d = 0
      let clients30d = 0
      
      let activeStores = 0
      let expiredStores = 0
      let suspendedStores = 0

      for (const store of stores) {
        // Platform Health metrics
        if (store.status === 'active') {
          // Check if expired
          const expiry = store.expires_at ? new Date(store.expires_at) : null
          if (expiry && expiry < now) {
            expiredStores++
          } else {
            activeStores++
          }
        } else if (store.status === 'suspended') {
          suspendedStores++
        }

        // Recent clients metric
        const created = new Date(store.created_at)
        const diffDaysCreated = (now.getTime() - created.getTime()) / (1000 * 3600 * 24)
        if (diffDaysCreated <= 7) clients7d++
        if (diffDaysCreated <= 30) clients30d++

        // Activity metrics based on user login
        const storeUser = users.find(u => u.id === store.user_id)
        if (storeUser && storeUser.last_sign_in_at) {
          const lastSignIn = new Date(storeUser.last_sign_in_at)
          const diffDays = (now.getTime() - lastSignIn.getTime()) / (1000 * 3600 * 24)
          
          if (diffDays <= 7) {
            activeClients++
          } else if (diffDays <= 30) {
            riskClients++
          } else {
            inactiveClients++
          }
        } else {
          inactiveClients++ // never logged in or no user found
        }
      }

      // 4. Get total products
      const { count: productsCount } = await supabaseAdmin.from('products').select('*', { count: 'exact', head: true })
      
      // 5. Get total orders
      const { count: ordersCount } = await supabaseAdmin.from('orders').select('*', { count: 'exact', head: true })

      // 6. Get total active promotions
      const { count: promosCount } = await supabaseAdmin.from('promocoes').select('*', { count: 'exact', head: true }).eq('ativa', true)

      // 7. Get stores with active campaigns
      const { data: activeCampaigns } = await supabaseAdmin.from('store_campaigns').select('store_id').eq('is_active', true)
      const uniqueStoresWithCampaigns = new Set(activeCampaigns?.map(c => c.store_id)).size

      return new Response(JSON.stringify({
        success: true,
        data: {
          totalClients,
          activeClients,
          riskClients,
          inactiveClients,
          clients7d,
          clients30d,
          productsCount: productsCount || 0,
          ordersCount: ordersCount || 0,
          promosCount: promosCount || 0,
          storesWithCampaigns: uniqueStoresWithCampaigns,
          platformHealth: {
            total: totalClients,
            active: activeStores,
            expired: expiredStores,
            suspended: suspendedStores
          }
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'recent_clients' || action === 'clients') {
      const isRecent = action === 'recent_clients'
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = isRecent ? 10 : 20
      const offset = (page - 1) * limit
      const search = url.searchParams.get('search') || ''
      const filter = url.searchParams.get('filter') || 'all' // all, active, risk, inactive

      let query = supabaseAdmin.from('stores').select('*', { count: 'exact' })
      
      if (search) {
        query = query.ilike('name', `%${search}%`)
      }

      query = query.order('created_at', { ascending: false })
      
      // We fetch more because filtering by activity requires user data in memory
      // If no activity filter, we can paginate directly in DB.
      if (filter === 'all' || isRecent) {
        query = query.range(offset, offset + limit - 1)
      }

      const { data: stores, count, error: storesErr } = await query
      if (storesErr) throw storesErr

      // Get users
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers()
      const users = usersData?.users || []
      
      const now = new Date()

      let result = stores.map(store => {
        const user = users.find(u => u.id === store.user_id)
        
        let responsavel = store.name
        if (user) {
           if (user.user_metadata?.name) responsavel = user.user_metadata.name
           else if (user.email) responsavel = user.email
        }

        let activityStatus = 'inactive'
        let lastLogin = null
        if (user && user.last_sign_in_at) {
          lastLogin = user.last_sign_in_at
          const diffDays = (now.getTime() - new Date(lastLogin).getTime()) / (1000 * 3600 * 24)
          if (diffDays <= 7) activityStatus = 'active'
          else if (diffDays <= 30) activityStatus = 'risk'
        }

        return {
          id: store.id,
          name: store.name,
          slug: store.slug,
          custom_domain: store.custom_domain,
          status: store.status,
          plan: store.status === 'active' ? 'Pro' : 'Pending', // Simplified
          created_at: store.created_at,
          responsavel: responsavel,
          email: user?.email || '',
          telefone: store.whatsapp || '',
          last_login: lastLogin,
          activity_status: activityStatus
        }
      })

      if (filter !== 'all' && !isRecent) {
        // Client-side filtering and pagination if filter is applied
        result = result.filter(r => r.activity_status === filter)
        // Manual pagination
        result = result.slice(offset, offset + limit)
        // Note: 'count' here won't be accurate for filtered results, but it's okay for MVP
      }

      return new Response(JSON.stringify({
        success: true,
        data: result,
        count: filter === 'all' ? count : result.length // Approximate for filtered
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'client_detail') {
      const storeId = url.searchParams.get('store_id')
      if (!storeId) throw new Error('store_id is required')

      const { data: store, error: storeErr } = await supabaseAdmin.from('stores').select('*').eq('id', storeId).single()
      if (storeErr) throw storeErr

      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers()
      const user = (usersData?.users || []).find(u => u.id === store.user_id)

      let responsavel = store.name
      if (user) {
          if (user.user_metadata?.name) responsavel = user.user_metadata.name
          else if (user.email) responsavel = user.email
      }

      let activityStatus = 'inactive'
      let lastLogin = null
      if (user && user.last_sign_in_at) {
        lastLogin = user.last_sign_in_at
        const diffDays = (new Date().getTime() - new Date(lastLogin).getTime()) / (1000 * 3600 * 24)
        if (diffDays <= 7) activityStatus = 'active'
        else if (diffDays <= 30) activityStatus = 'risk'
      }

      // Usage stats
      const { count: encartesCount } = await supabaseAdmin.from('promocoes').select('*', { count: 'exact', head: true }).eq('store_id', storeId)
      const { count: productsCount } = await supabaseAdmin.from('products').select('*', { count: 'exact', head: true }).eq('store_id', storeId)
      const { count: ordersCount } = await supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }).eq('store_id', storeId)
      const { count: clientesCount } = await supabaseAdmin.from('clientes').select('*', { count: 'exact', head: true }).eq('store_id', storeId)
      const { count: campaignsCount } = await supabaseAdmin.from('store_campaigns').select('*', { count: 'exact', head: true }).eq('store_id', storeId).eq('is_active', true)

      // Subscription status calculation
      const now = new Date()
      let subscriptionStatus = store.status === 'suspended' ? 'blocked' : 'active'
      let expiresInDays: number | null = null
      if (store.expires_at) {
        const expiresAt = new Date(store.expires_at)
        expiresInDays = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 3600 * 24))
        if (store.status === 'suspended') {
          subscriptionStatus = 'blocked'
        } else if (expiresInDays > 7) {
          subscriptionStatus = 'active'
        } else if (expiresInDays > 0) {
          subscriptionStatus = 'expiring'
        } else if (expiresInDays >= -5) {
          subscriptionStatus = 'grace'
        } else {
          subscriptionStatus = 'blocked'
        }
      }

      return new Response(JSON.stringify({
        success: true,
        data: {
          store: {
            ...store,
            responsavel,
            email: user?.email || '',
            last_login: lastLogin,
            activity_status: activityStatus
          },
          usage: {
            encartes_criados: encartesCount || 0,
            produtos_cadastrados: productsCount || 0,
            orders_count: ordersCount || 0,
            clientes_count: clientesCount || 0,
            campaigns_count: campaignsCount || 0,
            pdfs_gerados: 0, // Placeholder
            subscription_status: subscriptionStatus,
            expires_in_days: expiresInDays
          }
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'release_store') {
      const storeId = url.searchParams.get('store_id')
      if (!storeId) throw new Error('store_id is required')

      const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabaseAdmin
        .from('stores')
        .update({ status: 'active', expires_at: newExpiry })
        .eq('id', storeId)
        .select()
        .single()
        
      if (error) throw error

      return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Configurações Globais da Evolution API (SUPER_ADMIN) ───────
    const maskKey = (key: string | null | undefined) => {
      if (!key) return ''
      if (key.length <= 8) return '••••••••'
      return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
    }

    if (action === 'get_global_config') {
      const { data: cfg, error: cfgErr } = await supabaseAdmin
        .from('global_config')
        .select('id, evolution_api_url, evolution_api_key, updated_at, last_tested_at, last_test_ok')
        .limit(1)
        .maybeSingle()

      if (cfgErr) throw cfgErr

      return new Response(JSON.stringify({
        success: true,
        data: {
          evolution_api_url: cfg?.evolution_api_url || '',
          has_api_key: Boolean(cfg?.evolution_api_key),
          masked_api_key: maskKey(cfg?.evolution_api_key),
          updated_at: cfg?.updated_at || null,
          last_tested_at: cfg?.last_tested_at || null,
          last_test_ok: cfg?.last_test_ok ?? null
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'save_global_config') {
      const body = await req.json().catch(() => ({}))
      const rawUrl = String(body.evolution_api_url || '').trim().replace(/\/+$/, '')
      const rawKey = String(body.evolution_api_key || '').trim()

      if (rawUrl && !/^https?:\/\/.+/i.test(rawUrl)) {
        return new Response(JSON.stringify({ success: false, error: 'URL inválida. Deve começar com http:// ou https://' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: existing } = await supabaseAdmin
        .from('global_config')
        .select('id, evolution_api_key')
        .limit(1)
        .maybeSingle()

      const finalKey = rawKey ? rawKey : (existing?.evolution_api_key || null)
      const nowIso = new Date().toISOString()

      let saved: any = null
      if (existing?.id) {
        const { data, error } = await supabaseAdmin
          .from('global_config')
          .update({
            evolution_api_url: rawUrl || null,
            evolution_api_key: finalKey,
            updated_at: nowIso
          })
          .eq('id', existing.id)
          .select('evolution_api_url, evolution_api_key, updated_at, last_tested_at, last_test_ok')
          .single()
        if (error) throw error
        saved = data
      } else {
        const { data, error } = await supabaseAdmin
          .from('global_config')
          .insert({
            evolution_api_url: rawUrl || null,
            evolution_api_key: finalKey,
            updated_at: nowIso
          })
          .select('evolution_api_url, evolution_api_key, updated_at, last_tested_at, last_test_ok')
          .single()
        if (error) throw error
        saved = data
      }

      return new Response(JSON.stringify({
        success: true,
        data: {
          evolution_api_url: saved.evolution_api_url || '',
          has_api_key: Boolean(saved.evolution_api_key),
          masked_api_key: maskKey(saved.evolution_api_key),
          updated_at: saved.updated_at,
          last_tested_at: saved.last_tested_at ?? null,
          last_test_ok: saved.last_test_ok ?? null
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'test_evolution_api') {
      const { data: cfg } = await supabaseAdmin
        .from('global_config')
        .select('id, evolution_api_url, evolution_api_key')
        .limit(1)
        .maybeSingle()

      const apiUrl = String(cfg?.evolution_api_url || '').trim().replace(/\/+$/, '')
      const apiKey = String(cfg?.evolution_api_key || '').trim()

      if (!apiUrl || !apiKey) {
        return new Response(JSON.stringify({
          success: false,
          ok: false,
          error: 'Cadastre e salve a URL e a API Key antes de testar a comunicação.'
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const nowIso = new Date().toISOString()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)

      let testOk = false
      let message = ''
      let statusCode = 0

      try {
        const res = await fetch(`${apiUrl}/instance/fetchInstances`, {
          method: 'GET',
          headers: { 'apikey': apiKey },
          signal: controller.signal
        })
        statusCode = res.status
        if (res.ok) {
          testOk = true
          message = 'Comunicação com a Evolution API estabelecida com sucesso.'
        } else if (res.status === 401 || res.status === 403) {
          message = 'API Key inválida ou sem permissão na Evolution API.'
        } else {
          message = `Evolution API respondeu com status HTTP ${res.status}.`
        }
      } catch (err: any) {
        message = err?.name === 'AbortError'
          ? 'Tempo limite excedido ao conectar com a Evolution API.'
          : 'Evolution API indisponível ou URL incorreta.'
      } finally {
        clearTimeout(timer)
      }

      if (cfg?.id) {
        await supabaseAdmin
          .from('global_config')
          .update({ last_tested_at: nowIso, last_test_ok: testOk })
          .eq('id', cfg.id)
      }

      return new Response(JSON.stringify({
        success: testOk,
        ok: testOk,
        statusCode,
        message,
        testedAt: nowIso
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('Platform Admin Error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
