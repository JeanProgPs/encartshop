import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const SUPABASE_URL = 'https://mhlxxxzuyfllnauhewnb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DlDsDwmZCJxd4lIYh19Idg_7Ve-xAef';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  try {
    // 1. Pega user logado
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // 2. Pega store do usuário
    const { data: stores, error: storesErr } = await supabase
      .from('stores')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (storesErr || !stores || stores.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const storeId = stores[0].id;

    // 3. Busca todos os produtos da loja
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (prodErr) {
      return res.status(400).json({ error: prodErr.message });
    }

    // 4. Cria workbook ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Produtos');

    // 5. Define as colunas
    const columns = [
      { header: 'ID', key: 'id', width: 36 },
      { header: 'Nome', key: 'name', width: 30 },
      { header: 'Descrição', key: 'description', width: 40 },
      { header: 'Categoria', key: 'category', width: 20 },
      { header: 'Preço', key: 'price', width: 12 },
      { header: 'Preço Promocional', key: 'promo_price', width: 18 },
      { header: 'Estoque', key: 'stock', width: 12 },
      { header: 'Status', key: 'active', width: 10 },
      { header: 'Imagem', key: 'image', width: 50 },
    ];

    worksheet.columns = columns;

    // 6. Estiliza header
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'center' };

    // 7. Adiciona produtos
    products.forEach(product => {
      worksheet.addRow({
        id:          product.id,
        name:        product.name || '',
        description: product.description || '',
        category:    product.category || '',
        price:       product.price || 0,
        promo_price: product.promo_price ?? '',
        stock:       product.stock || 0,
        active:      product.active ? 'Ativo' : 'Inativo',
        image:       product.image || '',
      });
    });

    // 8. Auto-ajusta colunas
    worksheet.columns.forEach(col => {
      col.width = Math.min(col.width || 15, 50);
    });

    // 9. Gera buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // 10. Retorna arquivo
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="produtos-encartshop.xlsx"`);
    res.status(200).send(buffer);

  } catch (error) {
    console.error('Erro ao exportar:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
