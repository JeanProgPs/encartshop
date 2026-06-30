-- ============================================================
-- EncartShop: Criação da Tabela de Campanhas (Banners/Outlet)
-- ============================================================

CREATE TABLE IF NOT EXISTS store_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    title VARCHAR(255),
    subtitle VARCHAR(255),
    button_text VARCHAR(100),
    
    desktop_image TEXT NOT NULL,
    mobile_image TEXT,
    
    target_type VARCHAR(50) DEFAULT 'category', -- category, collection, tag, brand, search, custom_url
    target_value TEXT,
    
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    
    starts_at TIMESTAMP WITH TIME ZONE,
    ends_at TIMESTAMP WITH TIME ZONE,
    
    -- Preparação para Analytics
    views_count INT DEFAULT 0,
    clicks_count INT DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_store_campaigns_store_id ON store_campaigns(store_id);
CREATE INDEX IF NOT EXISTS idx_store_campaigns_active ON store_campaigns(is_active);
CREATE INDEX IF NOT EXISTS idx_store_campaigns_sort ON store_campaigns(sort_order);

-- Habilitar RLS
ALTER TABLE store_campaigns ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Campanhas são visíveis para todos" 
ON store_campaigns FOR SELECT USING (true);

CREATE POLICY "Lojistas gerenciam suas próprias campanhas" 
ON store_campaigns FOR ALL 
USING (store_id IN (SELECT id FROM stores WHERE user_id = auth.uid()))
WITH CHECK (store_id IN (SELECT id FROM stores WHERE user_id = auth.uid()));

-- ============================================================
-- MIGRAÇÃO AUTOMÁTICA DOS BANNERS LEGADOS
-- ============================================================
-- Pega os stores que possuem banner_text configurado como array JSON
DO $$
DECLARE
    store_rec RECORD;
    banner_json JSON;
    banner_item JSON;
    idx INT;
BEGIN
    FOR store_rec IN 
        SELECT id, banner_text 
        FROM stores 
        WHERE banner_text IS NOT NULL 
          AND banner_text LIKE '[%' 
    LOOP
        BEGIN
            banner_json := store_rec.banner_text::json;
            idx := 0;
            
            FOR banner_item IN SELECT * FROM json_array_elements(banner_json)
            LOOP
                INSERT INTO store_campaigns (
                    store_id, 
                    desktop_image, 
                    mobile_image, 
                    target_type, 
                    target_value, 
                    sort_order
                ) VALUES (
                    store_rec.id,
                    banner_item->>'image_url',
                    banner_item->>'image_url', -- fallback para mobile também
                    'category',
                    banner_item->>'filter',
                    idx
                );
                idx := idx + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN
            -- Ignora erros de parse de JSON inválido no registro
            RAISE NOTICE 'Erro ao processar banners da loja %: %', store_rec.id, SQLERRM;
        END;
    END LOOP;
END;
$$;
