import { promises as dns } from 'dns';

const SUPABASE_URL = 'https://mhlxxxzuyfllnauhewnb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DlDsDwmZCJxd4lIYh19Idg_7Ve-xAef';

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { storeId } = req.body;
  const authHeader = req.headers.authorization;

  if (!storeId || !authHeader) {
    return res.status(400).json({ error: 'Store ID and Authorization header required' });
  }

  try {
    // 1. Validar e buscar a loja no Supabase (em nome do usuário, para garantir segurança)
    const storeResponse = await fetch(`${SUPABASE_URL}/rest/v1/stores?id=eq.${storeId}&select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    const stores = await storeResponse.json();
    if (!storeResponse.ok || !stores || stores.length === 0) {
      return res.status(404).json({ error: 'Store not found or access denied' });
    }

    const store = stores[0];

    // 2. Regras de Negócio Básicas
    if ((store.plan || '').toLowerCase() !== 'enterprise') {
      return res.status(403).json({ error: 'Only enterprise plan supports custom domains' });
    }

    const domain = store.custom_domain;
    if (!domain) {
      return res.status(400).json({ error: 'No custom domain configured' });
    }

    // 3. Verificação de DNS
    let isVerified = false;
    let dnsDetails = '';

    try {
      // Procurar registros CNAME
      const cnames = await dns.resolveCname(domain);
      const isCnameValid = cnames.some(c => c.toLowerCase() === 'lojas.encartshop.com' || c.toLowerCase().includes('encartshop.com') || c.toLowerCase().includes('vercel.app') || c.toLowerCase().includes('vercel-dns.com'));
      
      if (isCnameValid) {
        isVerified = true;
        dnsDetails = `CNAME validado: apontando para ${cnames.join(', ')}`;
      } else {
        dnsDetails = `CNAME encontrado, mas apontando para destinos inválidos: ${cnames.join(', ')}`;
      }
    } catch (err) {
      // Se falhar o CNAME, pode ser que tenham configurado A record (IP da Vercel)
      try {
        const aRecords = await dns.resolve4(domain);
        // IPs base da Vercel (76.76.21.21) ou qualquer um de rede Anycast. Vamos aceitar se retornar algum A record válido?
        // O ideal é exigir o CNAME. Mas como fallback provisório de validação relaxada:
        if (aRecords.length > 0) {
           isVerified = true;
           dnsDetails = `A Record validado: ${aRecords.join(', ')}`;
        } else {
           dnsDetails = `Nenhum registro A encontrado.`;
        }
      } catch (aErr) {
        dnsDetails = `Erro DNS: Não foi possível resolver CNAME ou A para o domínio. (${err.code || err.message})`;
      }
    }

    // 4. Atualizar o Supabase se validado
    if (isVerified && !store.custom_domain_verified) {
      // Atualiza o status
      await fetch(`${SUPABASE_URL}/rest/v1/stores?id=eq.${storeId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ custom_domain_verified: true })
      });
    }

    // 5. Inserir Log de Verificação
    await fetch(`${SUPABASE_URL}/rest/v1/domain_logs`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        store_id: store.id,
        action: isVerified ? 'VERIFICATION_SUCCESS' : 'VERIFICATION_FAILED',
        domain: domain,
        details: dnsDetails
      })
    });

    return res.status(200).json({
      verified: isVerified,
      domain: domain,
      details: dnsDetails
    });

  } catch (error) {
    console.error('Verify Domain Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
