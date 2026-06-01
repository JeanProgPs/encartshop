-- ============================================================
-- EncartShop — Módulo Clientes Automático (Alterações)
-- Migration: alter_clientes_table.sql
-- ============================================================

-- ============================================================
-- 1. ALTERAR TABELA clientes (Já existente)
-- ============================================================
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS tags text[];

-- Adiciona índice único para telefone por loja (para evitar duplicatas)
-- Removemos a constraint antiga de email unico se o foco for telefone, mas vamos manter e apenas garantir que o telefone seja rápido.
-- Nota: A tabela antiga tinha um UNIQUE(store_id, email). Vamos deixar.
-- Vamos criar um índice único para telefone, considerando lojas que usam WhatsApp.
CREATE UNIQUE INDEX IF NOT EXISTS clientes_store_telefone_idx ON clientes(store_id, telefone) WHERE telefone IS NOT NULL AND telefone != '';

-- ============================================================
-- 2. ADICIONAR cliente_id NA TABELA orders
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_phone text,  -- capturado no checkout (input opcional)
  ADD COLUMN IF NOT EXISTS customer_address text; -- endereço completo capturado no checkout

CREATE INDEX IF NOT EXISTS orders_cliente_id_idx ON orders(cliente_id);

-- ============================================================
-- 3. FUNÇÃO TRIGGER: upsert automático de cliente ao inserir pedido
-- ============================================================
CREATE OR REPLACE FUNCTION fn_upsert_cliente_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
  v_phone       text;
  v_name        text;
  v_address     text;
  v_order_total numeric(12,2);
BEGIN
  -- Normaliza telefone: remove tudo que não é dígito
  v_phone   := regexp_replace(COALESCE(NEW.customer_phone, ''), '\D', '', 'g');
  v_name    := TRIM(COALESCE(SPLIT_PART(NEW.customer_name, '[', 1), ''));  -- retira sufixo [#REF]
  v_address := NEW.customer_address;
  v_order_total := COALESCE(NEW.total, 0);

  -- Só processa se o telefone foi fornecido
  IF v_phone IS NOT NULL AND v_phone != '' THEN

    -- Tenta encontrar cliente existente pelo store_id + telefone
    SELECT id INTO v_cliente_id
      FROM clientes
     WHERE store_id = NEW.store_id
       AND telefone = v_phone
     LIMIT 1;

    IF v_cliente_id IS NOT NULL THEN
      -- CLIENTE EXISTENTE: atualiza nome, endereço e incrementa estatísticas
      UPDATE clientes SET
        nome          = CASE WHEN v_name != '' THEN v_name ELSE nome END,
        endereco      = COALESCE(NULLIF(v_address, ''), endereco),
        total_pedidos = total_pedidos + 1,
        total_gasto   = total_gasto + v_order_total,
        ultimo_pedido = now(),
        updated_at    = now()
      WHERE id = v_cliente_id;

    ELSE
      -- NOVO CLIENTE: cria automaticamente
      INSERT INTO clientes (store_id, telefone, nome, endereco, total_pedidos, total_gasto, ultimo_pedido)
      VALUES (
        NEW.store_id,
        v_phone,
        COALESCE(NULLIF(v_name, ''), 'Cliente sem nome'),
        NULLIF(v_address, ''),
        1,
        v_order_total,
        now()
      )
      RETURNING id INTO v_cliente_id;
    END IF;

    -- Vincula cliente_id ao pedido
    NEW.cliente_id := v_cliente_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. CRIAR TRIGGER na tabela orders
-- ============================================================
DROP TRIGGER IF EXISTS trg_upsert_cliente ON orders;

CREATE TRIGGER trg_upsert_cliente
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_upsert_cliente_on_order();

-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
