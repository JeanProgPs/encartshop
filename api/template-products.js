import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Cria workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Produtos');

    // Define colunas
    const columns = [
      { header: 'ID', key: 'id', width: 15 },
      { header: 'Nome', key: 'name', width: 25 },
      { header: 'Descrição', key: 'description', width: 35 },
      { header: 'Categoria', key: 'category', width: 15 },
      { header: 'Preço', key: 'price', width: 12 },
      { header: 'Preço Promocional', key: 'promo_price', width: 15 },
      { header: 'Estoque', key: 'stock', width: 12 },
      { header: 'SKU', key: 'sku', width: 12 },
      { header: 'Status', key: 'active', width: 10 },
      { header: 'Imagem', key: 'image', width: 40 },
      { header: 'Marca', key: 'brand', width: 12 },
      { header: 'Gênero', key: 'gender', width: 12 },
      { header: 'Cor', key: 'color', width: 12 },
      { header: 'Tamanho', key: 'size', width: 10 },
    ];

    worksheet.columns = columns;

    // Estiliza header
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'center' };

    // Exemplo de produto
    worksheet.addRow({
      id: '',
      name: 'Camiseta Básica',
      description: 'Camiseta confortável de algodão',
      category: 'Camisetas',
      price: 49.90,
      promo_price: 39.90,
      stock: 100,
      sku: 'CAM001',
      active: 'Ativo',
      image: 'https://exemplo.supabase.co/storage/v1/object/public/products/exemplo.jpg',
      brand: 'Nike',
      gender: 'Masculino',
      color: 'Preto',
      size: 'M',
    });

    // Estiliza exemplo
    const exampleRow = worksheet.getRow(2);
    exampleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
    exampleRow.font = { italic: true, color: { argb: 'FF666666' } };

    // Congela header
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Gera buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Retorna
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo-produtos.xlsx"');
    res.status(200).send(buffer);

  } catch (error) {
    console.error('Erro ao gerar modelo:', error);
    res.status(500).json({ error: 'Erro ao gerar modelo' });
  }
};
