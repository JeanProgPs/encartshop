-- ============================================================
-- EncartShop: Adiciona suporte a múltiplos segmentos (FOOD, FASHION)
-- ============================================================

-- ============================================================
-- 1. ADICIONAR SEGMENTO NA TABELA STORES
-- ============================================================

ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS store_segment VARCHAR(50) 
DEFAULT 'market' 
CHECK (store_segment IN ('market', 'food', 'fashion'));

-- Índice para consultas por segmento
CREATE INDEX IF NOT EXISTS idx_stores_segment ON stores(store_segment);

-- ============================================================
-- 2. EXPANDIR TABELA PRODUCTS COM DESCRIÇÃO E IMAGENS EXTRAS
-- ============================================================

ALTER TABLE products
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS image_url_2 TEXT;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS image_url_3 TEXT;

-- Índices para busca por texto (opcional, para future use)
CREATE INDEX IF NOT EXISTS idx_products_description ON products USING gin(to_tsvector('portuguese', description));

-- ============================================================
-- 3. COMPATIBILIDADE
-- ============================================================

-- Todos os campos são opcionais (NULL allowed)
-- Lojas existentes terão store_segment = 'market' (default)
-- Produtos existentes podem não ter descrição ou imagens extras
-- Sistema continua funcionando normalmente

-- ============================================================
-- TESTES RÁPIDOS (descomentar para validar)
-- ============================================================

-- SELECT column_name, column_default, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name IN ('stores', 'products') 
-- ORDER BY table_name, ordinal_position;
