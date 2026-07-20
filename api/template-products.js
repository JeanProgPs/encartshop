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
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Produtos');

    // Colunas que existem na tabela products do Supabase
    worksheet.columns = [
      { header: 'ID',               key: 'id',          width: 36 },
      { header: 'Nome',             key: 'name',        width: 30 },
      { header: 'Descrição',        key: 'description', width: 40 },
      { header: 'Categoria',        key: 'category',    width: 20 },
      { header: 'Preço',            key: 'price',       width: 12 },
      { header: 'Preço Promocional',key: 'promo_price', width: 18 },
      { header: 'Estoque',          key: 'stock',       width: 12 },
      { header: 'Status',           key: 'active',      width: 10 },
      { header: 'Imagem',           key: 'image',       width: 50 },
    ];

    // Estiliza cabeçalho
    const headerRow = worksheet.getRow(1);
    headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height    = 24;

    // Linha de exemplo
    worksheet.addRow({
      id:          '',                  // Deixe em branco para criar novo produto
      name:        'Camiseta Básica',
      description: 'Camiseta confortável de algodão 100%',
      category:    'Camisetas',
      price:       49.90,
      promo_price: 39.90,
      stock:       100,
      active:      'Ativo',            // "Ativo" ou "Inativo"
      image:       'https://exemplo.com/imagem.jpg',
    });

    // Estiliza linha de exemplo
    const exampleRow = worksheet.getRow(2);
    exampleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
    exampleRow.font = { italic: true, color: { argb: 'FF4B5563' } };

    // Congela cabeçalho
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Gera buffer e retorna
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo-produtos.xlsx"');
    return res.status(200).send(buffer);

  } catch (error) {
    console.error('Erro ao gerar modelo:', error);
    return res.status(500).json({ error: 'Erro ao gerar modelo: ' + error.message });
  }
}
