/**
 * EncartShop — Storage Module v3
 * Upload seguro com validação, compressão e feedback de progresso.
 * Suporta produtos (bucket: products) e logos (bucket: logos).
 */

const StorageModule = (() => {
  const BUCKET_PRODUCTS = 'products';
  const BUCKET_LOGOS    = 'logos';

  const MAX_SIZE_MB    = 2;
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
  const ALLOWED_TYPES  = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const MAX_DIMENSION  = 1200; // pixels para produtos
  const LOGO_DIMENSION = 400;  // pixels para logos (quadrado)

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
   * Comprime imagem via Canvas API.
   * @param {File} file
   * @param {number} maxDimension - largura/altura máxima
   * @param {number} quality - qualidade WebP (0–1)
   * @returns {Promise<Blob>}
   */
  async function compressImage(file, maxDimension = MAX_DIMENSION, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        let { width, height } = img;

        // Redimensiona mantendo proporção se necessário
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width  = maxDimension;
          } else {
            width  = Math.round((width  * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Falha ao comprimir imagem.'));
          },
          'image/webp',
          quality
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
   * Upload genérico para qualquer bucket.
   * @private
   */
  async function _upload(file, bucketName, folder, maxDim, quality, onProgress) {
    const validationError = validateFile(file);
    if (validationError) throw new Error(validationError);

    if (typeof onProgress === 'function') onProgress(10);

    let uploadBlob;
    try {
      uploadBlob = await compressImage(file, maxDim, quality);
    } catch (compressErr) {
      console.warn('[StorageModule] Compressão falhou, usando arquivo original:', compressErr);
      uploadBlob = file;
    }

    if (typeof onProgress === 'function') onProgress(40);

    const ext      = 'webp';
    const random   = Math.random().toString(36).substring(2, 10);
    const ts       = Date.now();
    const fileName = `${random}-${ts}.${ext}`;
    const filePath = `${folder}/${fileName}`;

    const { data, error } = await window.sb.storage
      .from(bucketName)
      .upload(filePath, uploadBlob, {
        cacheControl: '31536000',
        upsert: false,
        contentType: 'image/webp'
      });

    if (typeof onProgress === 'function') onProgress(90);

    if (error) {
      if (error.message?.includes('bucket not found')) {
        throw new Error(`Bucket "${bucketName}" não encontrado. Configure o Storage no painel do Supabase.`);
      }
      if (error.message?.includes('row-level security')) {
        throw new Error('Sem permissão para fazer upload. Verifique as policies do Storage.');
      }
      throw error;
    }

    const { data: { publicUrl } } = window.sb.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    if (typeof onProgress === 'function') onProgress(100);

    return { publicUrl, path: filePath };
  }

  /**
   * Upload de imagem de produto (bucket: products).
   * @param {File} file
   * @param {string} storeId
   * @param {Function} onProgress
   * @returns {Promise<string>} URL pública
   */
  async function uploadImage(file, storeId = 'general', onProgress = null) {
    const result = await _upload(file, BUCKET_PRODUCTS, storeId, MAX_DIMENSION, 0.82, onProgress);
    return result.publicUrl;
  }

  /**
   * Upload de logo da loja (bucket: logos).
   * Redimensiona para máx. 400×400 com qualidade 0.90.
   * @param {File} file
   * @param {string} storeId
   * @param {Function} onProgress
   * @returns {Promise<{publicUrl: string, path: string}>}
   */
  async function uploadLogo(file, storeId = 'general', onProgress = null) {
    return await _upload(file, BUCKET_LOGOS, storeId, LOGO_DIMENSION, 0.90, onProgress);
  }

  /**
   * Remove uma logo antiga do bucket logos (best-effort, não bloqueia fluxo).
   * @param {string} path - caminho do arquivo (ex: "store-uuid/abc-123.webp")
   */
  async function deleteLogo(path) {
    if (!path) return;
    try {
      await window.sb.storage.from(BUCKET_LOGOS).remove([path]);
    } catch (e) {
      console.warn('[StorageModule] Falha ao remover logo antiga:', e);
    }
  }

  return {
    uploadImage,
    uploadLogo,
    deleteLogo,
    validateFile,
    compressImage,
    MAX_SIZE_MB,
    ALLOWED_TYPES
  };
})();

window.StorageModule = StorageModule;
