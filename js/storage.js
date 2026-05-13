/**
 * EncartShop — Storage Module v2
 * Upload seguro com validação, compressão e feedback de progresso.
 */

const StorageModule = (() => {
  const BUCKET_NAME  = 'products';
  const MAX_SIZE_MB  = 2;
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
  const ALLOWED_TYPES  = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const MAX_DIMENSION  = 1200; // pixels — comprime se maior

  /**
   * Valida o arquivo antes do upload.
   * @returns {string|null} mensagem de erro ou null se OK
   */
  function validateFile(file) {
    if (!file) return 'Nenhum arquivo selecionado.';
    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      return `Formato inválido. Use: JPG, PNG ou WEBP.`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      return `Arquivo muito grande (${sizeMB}MB). Máximo: ${MAX_SIZE_MB}MB.`;
    }
    return null;
  }

  /**
   * Comprime a imagem antes do upload via Canvas API.
   * Redimensiona se largura/altura > MAX_DIMENSION.
   * Converte para WebP com qualidade 0.82.
   * @returns {Promise<Blob>}
   */
  async function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        let { width, height } = img;

        // Redimensiona mantendo proporção se necessário
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width  = MAX_DIMENSION;
          } else {
            width  = Math.round((width  * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Tenta WebP primeiro, fallback para JPEG
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Falha ao comprimir imagem.'));
          },
          'image/webp',
          0.82
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Não foi possível ler a imagem.'));
      };

      img.src = url;
    });
  }

  /**
   * Faz upload seguro de uma imagem:
   * 1. Valida tipo e tamanho
   * 2. Comprime via Canvas
   * 3. Faz upload para Supabase Storage
   * 4. Retorna URL pública
   *
   * @param {File} file
   * @param {string} storeId — pasta do storage (uuid da loja)
   * @param {Function} onProgress — callback(percent) opcional
   * @returns {Promise<string>} URL pública
   */
  async function uploadImage(file, storeId = 'general', onProgress = null) {
    // 1. Valida
    const validationError = validateFile(file);
    if (validationError) throw new Error(validationError);

    if (typeof onProgress === 'function') onProgress(10);

    // 2. Comprime
    let uploadBlob;
    try {
      uploadBlob = await compressImage(file);
    } catch (compressErr) {
      console.warn('[StorageModule] Compressão falhou, usando arquivo original:', compressErr);
      uploadBlob = file; // fallback sem compressão
    }

    if (typeof onProgress === 'function') onProgress(40);

    // 3. Gera nome único (uuid-like sem dependência externa)
    const ext      = 'webp'; // sempre salva como webp após compressão
    const random   = Math.random().toString(36).substring(2, 10);
    const ts       = Date.now();
    const fileName = `${random}-${ts}.${ext}`;
    const filePath = `${storeId}/${fileName}`;

    // 4. Upload
    const { data, error } = await window.sb.storage
      .from(BUCKET_NAME)
      .upload(filePath, uploadBlob, {
        cacheControl: '31536000', // 1 ano — imagens imutáveis por nome
        upsert: false,
        contentType: 'image/webp'
      });

    if (typeof onProgress === 'function') onProgress(90);

    if (error) {
      if (error.message?.includes('bucket not found')) {
        throw new Error('Bucket "products" não encontrado. Configure o Storage no painel do Supabase.');
      }
      if (error.message?.includes('row-level security')) {
        throw new Error('Sem permissão para fazer upload. Verifique as policies do Storage.');
      }
      throw error;
    }

    // 5. URL pública
    const { data: { publicUrl } } = window.sb.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    if (typeof onProgress === 'function') onProgress(100);

    return publicUrl;
  }

  return { uploadImage, validateFile, compressImage, MAX_SIZE_MB, ALLOWED_TYPES };
})();

window.StorageModule = StorageModule;
