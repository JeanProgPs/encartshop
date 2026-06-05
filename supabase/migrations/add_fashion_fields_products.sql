-- Migration: add_fashion_fields_products
-- Adiciona campos de moda ao cadastro de produtos para o segmento fashion.
-- Preparado para evolução futura (variações, estoque por SKU), sem aumentar complexidade agora.

ALTER TABLE products
ADD COLUMN IF NOT EXISTS brand  TEXT,
ADD COLUMN IF NOT EXISTS gender TEXT,
ADD COLUMN IF NOT EXISTS color  TEXT,
ADD COLUMN IF NOT EXISTS size   TEXT;

-- Índice opcional para facilitar buscas por marca no futuro
CREATE INDEX IF NOT EXISTS idx_products_brand  ON products(brand)  WHERE brand  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_gender ON products(gender) WHERE gender IS NOT NULL;
