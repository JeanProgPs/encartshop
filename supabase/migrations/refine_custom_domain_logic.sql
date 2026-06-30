-- Migration: refine_custom_domain_logic
-- Refinamento da lógica de domínio próprio: auditoria e normalização automática.

CREATE TABLE IF NOT EXISTS domain_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    domain TEXT,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE domain_logs ENABLE ROW LEVEL SECURITY;

-- Lojistas podem inserir logs para suas próprias lojas
CREATE POLICY "Lojistas podem inserir logs"
ON domain_logs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM stores WHERE stores.id = domain_logs.store_id AND stores.user_id = auth.uid()
  )
);

-- Lojistas podem ver logs de suas próprias lojas
CREATE POLICY "Lojistas podem ver logs"
ON domain_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM stores WHERE stores.id = domain_logs.store_id AND stores.user_id = auth.uid()
  )
);

-- Função Trigger para normalização e validação de custom_domain
CREATE OR REPLACE FUNCTION trg_normalize_store_domain()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o campo custom_domain estiver presente e não for nulo
  IF NEW.custom_domain IS NOT NULL THEN
    
    -- Normalização
    NEW.custom_domain := lower(trim(NEW.custom_domain));
    NEW.custom_domain := regexp_replace(NEW.custom_domain, '^https?://', '');
    NEW.custom_domain := regexp_replace(NEW.custom_domain, '/$', '');
    
    -- Se após limpar ficar vazio, convertemos para NULL
    IF NEW.custom_domain = '' THEN
      NEW.custom_domain := NULL;
    END IF;

    -- Validações (apenas se realmente for inserir um domínio válido)
    IF NEW.custom_domain IS NOT NULL THEN
       -- Segurança: Bloquear domínios nativos do sistema
       IF NEW.custom_domain ILIKE '%encartshop.com' THEN
         RAISE EXCEPTION 'Não é permitido configurar um domínio interno do sistema.';
       END IF;

       -- Regra de Negócio: Apenas plano Enterprise
       IF coalesce(NEW.plan, 'free') != 'enterprise' THEN
         RAISE EXCEPTION 'Apenas o plano Enterprise permite a configuração de domínio próprio.';
       END IF;
    END IF;
  END IF;

  -- Auditoria e Reset de Status
  IF OLD.custom_domain IS DISTINCT FROM NEW.custom_domain THEN
     -- Resetar verificação sempre que o domínio mudar
     NEW.custom_domain_verified := false;
     
     -- Inserir log (rodamos via trigger para garantir integridade, ignorando RLS via SECURITY DEFINER na trigger)
     -- Note que a trigger roda com as permissões do dono da tabela (postgres)
     INSERT INTO domain_logs (store_id, action, domain, details)
     VALUES (NEW.id, 'DOMAIN_CHANGED', NEW.custom_domain, 'Domínio alterado de ' || coalesce(OLD.custom_domain, 'vazio') || ' para ' || coalesce(NEW.custom_domain, 'vazio'));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar a Trigger na tabela stores
DROP TRIGGER IF EXISTS trg_store_custom_domain ON stores;
CREATE TRIGGER trg_store_custom_domain
BEFORE UPDATE ON stores
FOR EACH ROW
EXECUTE FUNCTION trg_normalize_store_domain();
