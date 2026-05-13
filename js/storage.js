/**
 * EncartShop — Storage Module
 * Gerenciamento de uploads de arquivos para o Supabase Storage.
 */

const StorageModule = (() => {
  const BUCKET_NAME = 'products';

  /**
   * Faz o upload de uma imagem e retorna a URL pública.
   * @param {File} file 
   * @param {string} path Opcional: sub-diretório (ex: id da loja)
   */
  async function uploadImage(file, path = 'general') {
    if (!file) return null;

    try {
      // 1. Gera um nome único para o arquivo
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `${path}/${fileName}`;

      // 2. Faz o upload
      const { data, error } = await window.sb.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        // Se o erro for que o bucket não existe, informa o usuário
        if (error.message.includes('bucket not found')) {
           throw new Error('Bucket "products" não encontrado no Supabase. Por favor, crie-o no painel do Supabase com acesso público.');
        }
        throw error;
      }

      // 3. Pega a URL pública
      const { data: { publicUrl } } = window.sb.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (err) {
      console.error('[StorageModule] Erro no upload:', err);
      throw err;
    }
  }

  return { uploadImage };
})();

window.StorageModule = StorageModule;
