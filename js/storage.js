/**
 * EncartShop — Storage Module
 * Gerenciamento de uploads de arquivos para o Supabase Storage.
 */

const StorageModule = (() => {
  const BUCKET_NAME = 'products';
  const MAX_SIZE_MB = 2;
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  /**
   * Comprime uma imagem usando Canvas.
   */
  async function compressImage(file, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Redimensiona se for muito grande (ex: max 1200px)
          const MAX_WIDTH = 1200;
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('Falha na compressão'));
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          }, 'image/jpeg', quality);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  }

  /**
   * Faz o upload de uma imagem e retorna a URL pública.
   */
  async function uploadImage(file, path = 'general') {
    if (!file) return null;

    // 1. Validações
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error('Tipo de arquivo não suportado. Use JPG, PNG ou WebP.');
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
       // Se for maior que 2MB, tentaremos comprimir agressivamente primeiro
       console.log('Arquivo grande detectado, comprimindo...');
    }

    try {
      // 2. Compressão automática
      const compressedFile = await compressImage(file);
      
      // Verifica se após compressão ainda está grande (raro)
      if (compressedFile.size > MAX_SIZE_MB * 1024 * 1024) {
        throw new Error(`A imagem é muito grande mesmo após compressão (Máx: ${MAX_SIZE_MB}MB)`);
      }

      // 3. Gera um nome único
      const fileExt = 'jpg'; // Forçamos jpg após compressão
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `${path}/${fileName}`;

      // 4. Faz o upload
      const { data, error } = await window.sb.storage
        .from(BUCKET_NAME)
        .upload(filePath, compressedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        if (error.message.includes('bucket not found')) {
           throw new Error('Bucket "products" não encontrado. Crie-o como público no Supabase.');
        }
        throw error;
      }

      // 5. URL pública
      const { data: { publicUrl } } = window.sb.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (err) {
      EncartHelpers.globalErrorHandler(err, 'Erro no upload da imagem');
      throw err;
    }
  }

  return { uploadImage };
})();

window.StorageModule = StorageModule;
