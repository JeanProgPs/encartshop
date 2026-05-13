-- ==================================================
-- ENCARTSHOP — POLÍTICAS DE SEGURANÇA (RLS)
-- EXECUTAR NO EDITOR SQL DO SUPABASE
-- ==================================================

-- 1. Habilitar RLS em todas as tabelas
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ==================================================
-- TABELA: stores
-- ==================================================

-- SELECT: Público pode ver lojas ativas, Dono vê a sua (mesmo pendente)
CREATE POLICY "Lojas são visíveis por todos se ativas ou pelo dono" 
ON stores FOR SELECT 
USING (status = 'active' OR auth.uid() = user_id);

-- INSERT: Apenas usuários autenticados podem criar lojas
CREATE POLICY "Usuários autenticados podem criar lojas" 
ON stores FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Apenas o dono pode atualizar sua loja
CREATE POLICY "Donos podem atualizar suas lojas" 
ON stores FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Apenas o dono pode deletar sua loja
CREATE POLICY "Donos podem deletar suas lojas" 
ON stores FOR DELETE 
USING (auth.uid() = user_id);


-- ==================================================
-- TABELA: products
-- ==================================================

-- SELECT: Público vê produtos de lojas ativas, Dono vê todos os seus
CREATE POLICY "Produtos visíveis se a loja estiver ativa ou for o dono" 
ON products FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM stores 
    WHERE stores.id = products.store_id 
    AND (stores.status = 'active' OR stores.user_id = auth.uid())
  )
);

-- INSERT/UPDATE/DELETE: Apenas o dono da loja vinculada
CREATE POLICY "Apenas donos podem manipular produtos" 
ON products FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM stores 
    WHERE stores.id = products.store_id 
    AND stores.user_id = auth.uid()
  )
);


-- ==================================================
-- TABELA: orders
-- ==================================================

-- SELECT: Apenas o dono da loja pode ver os pedidos
CREATE POLICY "Apenas donos veem pedidos da sua loja" 
ON orders FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM stores 
    WHERE stores.id = orders.store_id 
    AND stores.user_id = auth.uid()
  )
);

-- INSERT: Público pode criar pedidos (Checkout)
CREATE POLICY "Qualquer um pode criar pedidos" 
ON orders FOR INSERT 
WITH CHECK (true);

-- UPDATE/DELETE: Apenas o dono da loja
CREATE POLICY "Apenas donos manipulam status de pedidos" 
ON orders FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM stores 
    WHERE stores.id = orders.store_id 
    AND stores.user_id = auth.uid()
  )
);

-- ==================================================
-- CHECKLIST DE SEGURANÇA APLICADO:
-- [x] Isolamento total entre stores (user_id/store_id)
-- [x] Prevenção de enumeração (só vê o que é ativo ou seu)
-- [x] Bloqueio de escrita cruzada (apenas o dono altera seus dados)
-- [x] Checkout público permitido apenas para INSERT
-- ==================================================
