const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');
const busboy = require('busboy');

const SUPABASE_URL = 'https://mhlxxxzuyfllnauhewnb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DlDsDwmZCJxd4lIYh19Idg_7Ve-xAef';

module.exports = async (req, res) => {
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

    // 3. Lê arquivo Excel do request
    const bb = busboy({ headers: req.headers });
    let fileBuffer = null;

    await new Promise((resolve, reject) => {
      bb.on('file', (fieldname, file, info) => {
        if (info.filename.endsWith('.xlsx')) {
          const chunks = [];
          file.on('data', chunk => chunks.push(chunk));
          file.on('end', () => { fileBuffer = Buffer.concat(chunks); });
        }
      });
      bb.on('finish', resolve);
      bb.on('error', reject);
      req.pipe(bb);
    });

    if (!fileBuffer) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // 4. Parse Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet || worksheet.rowCount < 2) {
      return res.status(400).json({ error: 'Planilha vazia ou sem dados' });
    }

    // 5. Extrai headers
    const headers = worksheet.getRow(1).values;
    const columnMap = {};
    headers.forEach((header, idx) => {
      if (header) columnMap[header.trim().toLowerCase()] = idx;
    });

    // 6. Valida dados e prepara operações
    const created = [];
    const updated = [];
    const errors = [];

    for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const values = row.values;

      if (!values || values.every(v => !v)) continue; // Pula linhas vazias

      const rawPromo = getValue(values, columnMap['preço promocional']);
      const parsedPromo = rawPromo ? parseFloat(rawPromo.toString().replace(',', '.')) : null;

      const product = {
        id: getValue(values, columnMap['id']),
        name: getValue(values, columnMap['nome']),
        description: getValue(values, columnMap['descrição']),
        category: getValue(values, columnMap['categoria']),
        price: parseFloat(getValue(values, columnMap['preço']).toString().replace(',', '.') || 0),
        promo_price: parsedPromo,
        stock: parseInt(getValue(values, columnMap['estoque']) || 0),
        sku: getValue(values, columnMap['sku']),
        active: getValue(values, columnMap['status'], 'Ativo').toLowerCase() === 'ativo',
        image: getValue(values, columnMap['imagem']),
        brand: getValue(values, columnMap['marca']),
        gender: getValue(values, columnMap['gênero']),
        color: getValue(values, columnMap['cor']),
        size: getValue(values, columnMap['tamanho']),
      };

      // Limpar campos vazios que não devem ser enviados como string vazia
      if (!product.id) delete product.id;
      if (!product.description) product.description = null;
      if (!product.sku) product.sku = null;
      if (!product.image) product.image = null;
      if (!product.brand) product.brand = null;
      if (!product.gender) product.gender = null;
      if (!product.color) product.color = null;
      if (!product.size) product.size = null;

      // Validação
      const validation = validateProduct(product, rowNum);
      if (!validation.valid) {
        errors.push(`Linha ${rowNum}: ${validation.error}`);
        continue;
      }

      if (product.id) {
        // Atualizar
        updated.push({ ...product, store_id: storeId });
      } else {
        // Criar
        product.store_id = storeId;
        created.push(product);
      }
    }

    // 7. Executa inserts/updates
    if (created.length > 0) {
      const { error: insertErr } = await supabase
        .from('products')
        .insert(created);
      if (insertErr) {
        console.error('Insert error:', insertErr);
        errors.push(`Erro ao criar ${created.length} produtos: ${insertErr.message}`);
      }
    }

    if (updated.length > 0) {
      for (const product of updated) {
        const { error: updateErr } = await supabase
          .from('products')
          .update(product)
          .eq('id', product.id)
          .eq('store_id', storeId);
        if (updateErr) {
          console.error('Update error:', updateErr);
          errors.push(`Erro ao atualizar produto ${product.id}: ${updateErr.message}`);
        }
      }
    }

    // 8. Retorna resumo
    const summary = `Produtos processados: ${created.length + updated.length}\nProdutos criados: ${created.length}\nProdutos atualizados: ${updated.length}\nErros: ${errors.length}`;

    res.status(200).json({
      success: errors.length === 0,
      summary,
      created: created.length,
      updated: updated.length,
      errors: errors.slice(0, 5), // Primeiros 5 erros
      totalErrors: errors.length
    });

  } catch (error) {
    console.error('Erro ao importar:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao processar arquivo: ' + error.message 
    });
  }
};

function getValue(values, columnIndex, defaultValue = '') {
  if (!columnIndex) return defaultValue;
  return (values[columnIndex] || '').toString().trim() || defaultValue;
}

function validateProduct(product, rowNum) {
  if (!product.name) {
    return { valid: false, error: 'Nome é obrigatório' };
  }
  if (isNaN(product.price) || product.price < 0) {
    return { valid: false, error: 'Preço inválido' };
  }
  if (isNaN(product.stock) || product.stock < 0) {
    return { valid: false, error: 'Estoque inválido' };
  }
  if (product.image && !isValidUrl(product.image)) {
    return { valid: false, error: 'URL da imagem inválida' };
  }
  return { valid: true };
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}
