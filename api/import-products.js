import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import formidable from 'formidable';
import fs from 'fs';

const SUPABASE_URL = 'https://mhlxxxzuyfllnauhewnb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DlDsDwmZCJxd4lIYh19Idg_7Ve-xAef';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
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
    // 1. Autenticar usuário
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // 2. Buscar loja do usuário
    const { data: stores, error: storesErr } = await supabase
      .from('stores')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (storesErr || !stores || stores.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const storeId = stores[0].id;

    // 3. Parsear o arquivo enviado via multipart/form-data
    const form = formidable({ keepExtensions: true, maxFileSize: 10 * 1024 * 1024 });

    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });

    // Pegar o arquivo (pode estar em files.file ou files.file[0])
    let uploadedFile = files.file;
    if (Array.isArray(uploadedFile)) uploadedFile = uploadedFile[0];

    if (!uploadedFile) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // 4. Ler e parsear o Excel
    const fileBuffer = fs.readFileSync(uploadedFile.filepath || uploadedFile.path);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet || worksheet.rowCount < 2) {
      return res.status(400).json({ error: 'Planilha vazia ou sem dados' });
    }

    // 5. Mapear colunas pelos cabeçalhos
    const headerRow = worksheet.getRow(1).values; // índice 1-based, index 0 é undefined
    const columnMap = {};
    headerRow.forEach((header, idx) => {
      if (header) columnMap[header.toString().trim().toLowerCase()] = idx;
    });

    console.log('Colunas detectadas:', columnMap);

    // 6. Processar linhas
    const created = [];
    const updated = [];
    const errors = [];

    for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const values = row.values;

      if (!values || values.every(v => !v)) continue;

      const rawPrice = getValue(values, columnMap['preço'] ?? columnMap['preco']);
      const rawPromo = getValue(values, columnMap['preço promocional'] ?? columnMap['preco promocional']);
      const parsedPrice = rawPrice ? parseFloat(rawPrice.toString().replace(',', '.')) : 0;
      const parsedPromo = rawPromo ? parseFloat(rawPromo.toString().replace(',', '.')) : null;

      const rawId = getValue(values, columnMap['id']);

      const product = {
        name: getValue(values, columnMap['nome']),
        description: getValue(values, columnMap['descrição'] ?? columnMap['descricao']) || null,
        category: getValue(values, columnMap['categoria']) || null,
        price: isNaN(parsedPrice) ? 0 : parsedPrice,
        promo_price: parsedPromo === null || isNaN(parsedPromo) ? null : parsedPromo,
        stock: parseInt(getValue(values, columnMap['estoque']) || '0', 10),
        sku: getValue(values, columnMap['sku']) || null,
        active: (getValue(values, columnMap['status']) || 'ativo').toLowerCase() === 'ativo',
        image: getValue(values, columnMap['imagem']) || null,
        brand: getValue(values, columnMap['marca']) || null,
        gender: getValue(values, columnMap['gênero'] ?? columnMap['genero']) || null,
        color: getValue(values, columnMap['cor']) || null,
        size: getValue(values, columnMap['tamanho']) || null,
      };

      // Validação básica
      if (!product.name) {
        errors.push(`Linha ${rowNum}: Nome é obrigatório`);
        continue;
      }

      if (rawId && rawId.trim() !== '') {
        // Atualizar produto existente
        updated.push({ ...product, id: rawId.trim(), store_id: storeId });
      } else {
        // Criar produto novo
        product.store_id = storeId;
        created.push(product);
      }
    }

    // 7. Inserir novos produtos
    if (created.length > 0) {
      const { error: insertErr } = await supabase
        .from('products')
        .insert(created);
      if (insertErr) {
        console.error('Insert error:', insertErr);
        errors.push(`Erro ao criar produtos: ${insertErr.message}`);
      }
    }

    // 8. Atualizar produtos existentes
    for (const product of updated) {
      const { id, ...updateData } = product;
      const { error: updateErr } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', id)
        .eq('store_id', storeId);
      if (updateErr) {
        console.error('Update error for', id, updateErr);
        errors.push(`Erro ao atualizar produto ${id}: ${updateErr.message}`);
      }
    }

    // 9. Limpar arquivo temporário
    try { fs.unlinkSync(uploadedFile.filepath || uploadedFile.path); } catch (_) {}

    const summary = `Produtos criados: ${created.length} | Atualizados: ${updated.length} | Erros: ${errors.length}`;

    return res.status(200).json({
      success: errors.length === 0,
      summary,
      created: created.length,
      updated: updated.length,
      errors: errors.slice(0, 10),
      totalErrors: errors.length
    });

  } catch (error) {
    console.error('Erro ao importar:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao processar arquivo: ' + error.message
    });
  }
}

function getValue(values, columnIndex, defaultValue = '') {
  if (columnIndex === undefined || columnIndex === null) return defaultValue;
  const val = values[columnIndex];
  if (val === null || val === undefined) return defaultValue;
  return val.toString().trim() || defaultValue;
}
