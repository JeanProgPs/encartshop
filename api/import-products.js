import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const SUPABASE_URL = 'https://mhlxxxzuyfllnauhewnb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DlDsDwmZCJxd4lIYh19Idg_7Ve-xAef';

// bodyParser ativado (padrão) — recebe JSON com arquivo em base64
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
      return res.status(401).json({ success: false, error: 'Usuário não autenticado' });
    }

    // 2. Buscar loja do usuário
    const { data: stores, error: storesErr } = await supabase
      .from('stores')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (storesErr || !stores || stores.length === 0) {
      return res.status(404).json({ success: false, error: 'Loja não encontrada' });
    }

    const storeId = stores[0].id;

    // 3. Decodificar arquivo base64 do body JSON
    const body = req.body;
    if (!body || !body.file) {
      return res.status(400).json({ success: false, error: 'Arquivo não enviado' });
    }

    const fileBuffer = Buffer.from(body.file, 'base64');

    // 4. Parsear o Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet || worksheet.rowCount < 2) {
      return res.status(400).json({ success: false, error: 'Planilha vazia ou sem dados' });
    }

    // 5. Mapear colunas pelos cabeçalhos (linha 1)
    const headerRow = worksheet.getRow(1).values; // array 1-based (index 0 = undefined)
    const columnMap = {};
    headerRow.forEach((header, idx) => {
      if (header) {
        const key = header.toString().trim().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos para comparação
        columnMap[key] = idx;
      }
    });

    console.log('Colunas mapeadas:', JSON.stringify(columnMap));

    // 6. Processar linhas
    const created = [];
    const updated = [];
    const errors = [];

    for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const values = row.values;

      // Pular linhas completamente vazias
      if (!values || values.slice(1).every(v => v === null || v === undefined || v === '')) continue;

      const rawId    = getVal(values, columnMap['id']);
      const rawName  = getVal(values, columnMap['nome']);
      const rawPrice = getVal(values, columnMap['preco']);
      const rawPromo = getVal(values, columnMap['preco promocional']);
      const rawStock = getVal(values, columnMap['estoque']);
      const rawStatus = getVal(values, columnMap['status']) || 'ativo';

      const parsedPrice = rawPrice ? parseFloat(rawPrice.replace(',', '.')) : 0;
      const parsedPromo = rawPromo ? parseFloat(rawPromo.replace(',', '.')) : null;
      const parsedStock = parseInt(rawStock || '0', 10);

      if (!rawName) {
        errors.push(`Linha ${rowNum}: Nome é obrigatório`);
        continue;
      }

      const product = {
        name:        rawName,
        description: getVal(values, columnMap['descricao']) || null,
        category:    getVal(values, columnMap['categoria']) || null,
        price:       isNaN(parsedPrice) ? 0 : parsedPrice,
        promo_price: (parsedPromo === null || isNaN(parsedPromo)) ? null : parsedPromo,
        stock:       isNaN(parsedStock) ? 0 : parsedStock,
        active:      rawStatus.toLowerCase() === 'ativo',
        image:       getVal(values, columnMap['imagem']) || null,
      };

      if (rawId && rawId.trim() !== '') {
        updated.push({ ...product, id: rawId.trim(), store_id: storeId });
      } else {
        product.store_id = storeId;
        created.push(product);
      }
    }

    console.log(`Processando: ${created.length} novos, ${updated.length} atualizações, ${errors.length} erros`);

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
      const { id, store_id, ...updateData } = product;
      const { error: updateErr } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', id)
        .eq('store_id', storeId);
      if (updateErr) {
        console.error('Update error for', id, ':', updateErr);
        errors.push(`Erro ao atualizar produto ${id}: ${updateErr.message}`);
      }
    }

    const successCount = created.length + updated.length - errors.length;
    const summary = `Criados: ${created.length} | Atualizados: ${updated.length} | Erros: ${errors.length}`;

    return res.status(200).json({
      success: errors.length === 0,
      summary,
      created: created.length,
      updated: updated.length,
      errors: errors.slice(0, 10),
      totalErrors: errors.length
    });

  } catch (error) {
    console.error('Erro interno ao importar:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno: ' + error.message
    });
  }
}

/**
 * Pega o valor de uma célula pelo índice, retorna string limpa ou ''
 */
function getVal(values, columnIndex) {
  if (columnIndex === undefined || columnIndex === null) return '';
  const val = values[columnIndex];
  if (val === null || val === undefined) return '';
  // ExcelJS pode retornar objetos rich text
  if (typeof val === 'object' && val.richText) {
    return val.richText.map(r => r.text).join('').trim();
  }
  return val.toString().trim();
}
