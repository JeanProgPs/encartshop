-- Adicionar campo para CEP de Origem na tabela stores (Usado para cálculo de Correios)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS origin_zip VARCHAR(10);
